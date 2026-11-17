# 🚀 Guía de Despliegue 24/7 en la Nube con Enlace HTTPS Gratuito

Con esta configuración, tu aplicación funcionará de manera ininterrumpida las 24 horas del día (incluso con tu PC apagada) y podrás acceder a ella desde tu teléfono, tablet o cualquier computadora a través de un link gratuito con candado verde SSL (`https://...`).

---

## 🥇 Opción Recomendada: Despliegue en Render (100% Gratis)

### Paso 1: Subir tu código a GitHub
1. Abre [GitHub.com](https://github.com) e inicia sesión (o regístrate gratis).
2. Haz clic en el botón verde **New** para crear un nuevo repositorio.
3. Asígnale un nombre (por ejemplo: `YTDownloader`).
4. Selecciona **Private** (Privado) y haz clic en **Create repository**.
5. Sube los archivos de tu carpeta a GitHub (puedes arrastrar los archivos directamente a la web de GitHub, o usar Git desde tu terminal):
   ```bash
   git init
   git add .
   git commit -m "MediaDownloader Ultra Lunysse Edition"
   git branch -M main
   git remote add origin https://github.com/TU_USUARIO/YTDownloader.git
   git push -u origin main
   ```
   *(Nota: El archivo `.gitignore` ya está configurado para que no se suban los `.exe` pesados ni tus videos descargados).*

---

### Paso 2: Crear el Web Service en Render
1. Entra en [Render.com](https://render.com) y selecciona **Get Started for Free** (inicia sesión con tu cuenta de GitHub).
2. En tu panel de control, haz clic en **New +** y selecciona **Web Service**.
3. Selecciona la opción **Build and deploy from a Git repository**.
4. Busca y selecciona tu repositorio `YTDownloader`.
5. Configura los siguientes campos:
   - **Name**: Elige el nombre que desees para tu enlace (por ejemplo: `sylveader-media` o `midownloader`). Tu enlace final será `https://tunombre.onrender.com`.
   - **Region**: Selecciona la más cercana (por ejemplo: *Oregon (US West)* o *Frankfurt*).
   - **Language / Runtime**: Selecciona **Docker** (Render detectará automáticamente el archivo `Dockerfile` que preparamos).
   - **Instance Type**: Selecciona **Free** (\$0 / mes).
6. Haz clic en el botón inferior **Create Web Service**.

---

### Paso 3: ¡Listo para usar!
Render compilará el contenedor instalando Node.js, Python, FFmpeg y yt-dlp en menos de 2 minutos.
Una vez terminado, verás un estado en verde que dice **Live** y tu enlace público arriba:

👉 **`https://tu-nombre.onrender.com`**

Puedes abrir este enlace en:
- El navegador de tu celular (iPhone / Android).
- Tu laptop o cualquier otra PC.
- Compartirlo con amigos.

Cada vez que descargues un video o canción, además de escucharlo en el reproductor de la app, podrás pulsar el botón **"Guardar en dispositivo"** para que el archivo se guarde directamente en tu teléfono o computadora.

---

## 🥈 Opción Alternativa: Railway.app

Si prefieres Railway:
1. Entra en [Railway.app](https://railway.app) e inicia sesión con GitHub.
2. Haz clic en **New Project** $\to$ **Deploy from GitHub repo**.
3. Selecciona `YTDownloader`.
4. En **Settings** $\to$ **Networking**, haz clic en **Generate Domain**.
5. Obtendrás un enlace instantáneo tipo: `https://ytdownloader-production.up.railway.app`.
