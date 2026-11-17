const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const { downloadYouTube } = require('./youtubeService');
const { downloadSpotifyTrack } = require('./spotifyService');
const { JobStatus } = require('../types/contracts');

class DownloadManager {
  constructor() {
    this.jobs = new Map();
    this.jobProcesses = new Map(); // jobId -> { child, cancelCallback }
    this.history = [];
    this.wsClients = new Set();
    this.jobCounter = 1;
    this.maxConcurrent = 2; // Límite adaptativo predeterminado (óptimo para no saturar red ni CPU)
    this.activeBatchCancelled = false;
    this.loadHistory();
  }

  setMaxConcurrent(limit) {
    const parsed = parseInt(limit, 10);
    if (!isNaN(parsed) && parsed >= 1 && parsed <= 3) {
      this.maxConcurrent = parsed;
      this.broadcast({ type: 'config_updated', maxConcurrent: this.maxConcurrent });
    }
    return this.maxConcurrent;
  }

  setWsClients(clients) {
    this.wsClients = clients;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const client of this.wsClients) {
      if (client.readyState === 1) { // OPEN
        client.send(data);
      }
    }
  }

  getHistoryFilePath() {
    return path.join(__dirname, '../../downloads', 'history.json');
  }

  loadHistory() {
    try {
      const p = this.getHistoryFilePath();
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, 'utf8');
        this.history = JSON.parse(raw);
      }
    } catch (e) {
      this.history = [];
    }
  }

  saveHistory() {
    try {
      const p = this.getHistoryFilePath();
      fs.writeFileSync(p, JSON.stringify(this.history.slice(-50), null, 2), 'utf8');
    } catch (e) {}
  }

  addToHistory(item) {
    if (!item.filePath || !fs.existsSync(item.filePath)) return;

    this.history.unshift({
      id: item.id || `hist_${Date.now()}`,
      title: item.title,
      artist: item.artist,
      type: item.type,
      quality: item.quality,
      format: item.format,
      filePath: item.filePath,
      fileName: path.basename(item.filePath),
      fileSize: item.fileSize || 'N/A',
      cover: item.cover,
      timestamp: new Date().toISOString()
    });
    this.saveHistory();
    this.broadcast({ type: 'history_updated', history: this.history });
  }

  createJob(meta) {
    const jobId = `job_${Date.now()}_${this.jobCounter++}`;
    const job = {
      id: jobId,
      title: meta.title || 'Descarga',
      platform: meta.platform,
      mode: meta.mode,
      quality: meta.quality,
      format: meta.format,
      cover: meta.cover,
      status: JobStatus.STARTING,
      percent: 0,
      speed: '0 KB/s',
      eta: '--:--',
      filePath: null,
      error: null
    };
    this.jobs.set(jobId, job);
    this.broadcast({ type: 'job_created', job });
    return job;
  }

  updateJob(jobId, patch) {
    const job = this.jobs.get(jobId);
    if (!job) return;
    Object.assign(job, patch);
    this.broadcast({ type: 'job_progress', job });
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    const procInfo = this.jobProcesses.get(jobId);
    if (procInfo) {
      try {
        if (typeof procInfo.cancelCallback === 'function') {
          procInfo.cancelCallback();
        }
        if (procInfo.child && procInfo.child.pid) {
          if (process.platform === 'win32') {
            exec(`taskkill /pid ${procInfo.child.pid} /T /F`);
          } else {
            procInfo.child.kill('SIGTERM');
          }
        }
      } catch (e) {
        console.error(`[CANCEL JOB ERROR] ${jobId}:`, e.message);
      }
      this.jobProcesses.delete(jobId);
    }

    this.updateJob(jobId, {
      status: JobStatus.CANCELLED,
      percent: 0,
      message: 'Descarga cancelada.'
    });

    return true;
  }

  async runYouTubeJob(options) {
    const job = this.createJob({
      title: options.title || 'Video de YouTube',
      platform: 'youtube',
      mode: options.mode,
      quality: options.quality,
      format: options.audioFormat || 'mp4',
      cover: options.thumbnail
    });

    try {
      const result = await downloadYouTube(
        options,
        (prog) => {
          this.updateJob(job.id, {
            status: prog.stage,
            percent: prog.percent || 0,
            speed: prog.speed || job.speed,
            eta: prog.eta || job.eta,
            message: prog.message,
            filePath: prog.filePath || job.filePath
          });
        },
        (child, cancelCallback) => {
          this.jobProcesses.set(job.id, { child, cancelCallback });
        }
      );

      this.jobProcesses.delete(job.id);

      if (result.filePath) {
        result.filePath = result.filePath.replace(/^["']|["']$/g, '');
      }

      let fileSize = 'N/A';
      if (result.filePath && fs.existsSync(result.filePath)) {
        const bytes = fs.statSync(result.filePath).size;
        fileSize = (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      this.updateJob(job.id, {
        status: JobStatus.COMPLETED,
        percent: 100,
        filePath: result.filePath,
        message: '¡Descarga finalizada con éxito!'
      });

      this.addToHistory({
        title: options.title,
        type: options.mode === 'video' ? 'youtube_video' : 'youtube_audio',
        quality: options.quality,
        format: options.mode === 'video' ? 'mp4' : options.audioFormat,
        filePath: result.filePath,
        fileSize,
        cover: options.thumbnail
      });

      return result;
    } catch (err) {
      this.jobProcesses.delete(job.id);
      if (job.status !== JobStatus.CANCELLED) {
        this.updateJob(job.id, {
          status: JobStatus.ERROR,
          error: err.message,
          message: 'Error en la descarga'
        });
      }
      throw err;
    }
  }

  async runSpotifyTrackJob(track, options, retryCount = 0) {
    const job = this.createJob({
      title: `${track.artist} - ${track.name}`,
      platform: 'spotify',
      mode: 'audio',
      quality: '320 kbps (HD)',
      format: options.audioFormat || 'mp3',
      cover: track.cover
    });

    try {
      const result = await downloadSpotifyTrack(
        track,
        options,
        (prog) => {
          this.updateJob(job.id, {
            status: prog.stage,
            percent: prog.percent || 0,
            speed: prog.speed || job.speed,
            eta: prog.eta || job.eta,
            message: prog.message,
            filePath: prog.filePath || job.filePath
          });
        },
        (child, cancelCallback) => {
          this.jobProcesses.set(job.id, { child, cancelCallback });
        }
      );

      this.jobProcesses.delete(job.id);

      if (result.filePath) {
        result.filePath = result.filePath.replace(/^["']|["']$/g, '');
      }

      let fileSize = 'N/A';
      if (result.filePath && fs.existsSync(result.filePath)) {
        const bytes = fs.statSync(result.filePath).size;
        fileSize = (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      this.updateJob(job.id, {
        status: JobStatus.COMPLETED,
        percent: 100,
        filePath: result.filePath,
        message: '¡Pista completada!'
      });

      this.addToHistory({
        title: track.name,
        artist: track.artist,
        type: 'spotify',
        quality: '320 kbps (Alta fidelidad)',
        format: options.audioFormat || 'mp3',
        filePath: result.filePath,
        fileSize,
        cover: track.cover
      });

      return result;
    } catch (err) {
      this.jobProcesses.delete(job.id);

      // Reintento adaptativo ante fallas esporádicas de red o limitación de tasa
      if (job.status !== JobStatus.CANCELLED && retryCount < 1) {
        console.warn(`[RETRY] Reintentando ${track.name} en 2s por error:`, err.message);
        this.updateJob(job.id, {
          message: 'Falla temporal de red detectada. Reintentando...'
        });
        await new Promise(r => setTimeout(r, 2000));
        return this.runSpotifyTrackJob(track, options, retryCount + 1);
      }

      if (job.status !== JobStatus.CANCELLED) {
        this.updateJob(job.id, {
          status: JobStatus.ERROR,
          error: err.message,
          message: 'Error al descargar pista de Spotify'
        });
      }
      throw err;
    }
  }

  /**
   * Ejecuta la descarga de lotes con cola de concurrencia adaptativa y espaciado anti-saturación
   */
  async runSpotifyBatch(tracks, options) {
    const queue = [...tracks];
    const active = new Set();
    this.activeBatchCancelled = false;

    const runNext = async () => {
      if (queue.length === 0 || this.activeBatchCancelled) return;
      const track = queue.shift();

      // Espaciado anti-saturación (pacing de 500ms entre solicitudes)
      await new Promise(r => setTimeout(r, 500));

      const promise = this.runSpotifyTrackJob(track, options)
        .catch(err => {
          console.error(`[BATCH] Falla en pista ${track.name}:`, err.message);
        })
        .finally(() => {
          active.delete(promise);
          return runNext();
        });

      active.add(promise);
      if (active.size < this.maxConcurrent && queue.length > 0) {
        await runNext();
      }
      return promise;
    };

    const initialWorkers = [];
    const count = Math.min(this.maxConcurrent, queue.length);
    for (let i = 0; i < count; i++) {
      initialWorkers.push(runNext());
    }

    await Promise.all(initialWorkers);
  }
}

module.exports = new DownloadManager();
