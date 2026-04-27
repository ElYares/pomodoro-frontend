# Pomodoro Frontend + Backend

Proyecto de Pomodoro con frontend en Astro, backend en Express y persistencia en PostgreSQL para web/Docker, más SQLite para escritorio.

## Desktop branch

La rama `v1-app-desktop` empieza la migración a escritorio con `Electron`.

Estado actual de esta primera base:

- levanta la UI Astro dentro de una ventana desktop
- inyecta la URL de la API en runtime para no depender de una constante fija
- arranca el backend local para el modo desktop
- usa `SQLite` local para escritorio
- mantiene `PostgreSQL` para el flujo web actual con Docker

Pendiente para una siguiente fase:

- afinado visual/UX del empaquetado e iconografía final

## Servicios

- `frontend`: Astro compilado y servido por Nginx en `http://localhost:3000`
- `backend`: API REST en `http://localhost:8080/api/v1`
- `db`: PostgreSQL en `localhost:5432`

## Levantar el stack

```sh
docker compose up -d --build
```

## Desktop development

Requisitos:

- Node.js instalado
- para escritorio ya no hace falta PostgreSQL
- para el stack web/Docker se mantiene PostgreSQL

Instalación inicial:

```sh
npm install
cd backend && npm install
```

Modo desktop con hot reload:

```sh
npm run desktop:dev
```

Modo desktop contra el build de Astro:

```sh
npm run desktop:start
```

Empaquetado desktop:

```sh
npm run desktop:package
npm run desktop:dist
npm run desktop:dist:linux
```

El backend desktop escucha solo en `127.0.0.1` y usa SQLite local. El flujo Docker actual no cambia porque `docker-compose.yml` sigue levantando PostgreSQL para el stack web.

En desktop, la persistencia queda en un archivo `SQLite`:

- desarrollo: `.desktop-data/pomodoro.sqlite`
- app desktop: directorio `userData` de Electron

Notas de empaquetado:

- `desktop:package` genera un bundle sin instalador en `release/`
- `desktop:dist` intenta generar artefactos distribuibles con `electron-builder`
- `desktop:dist:linux` genera `release/Pomodoro Pixel-0.0.1.AppImage`
- para empaquetar, asegúrate de haber corrido también `npm install --prefix backend`
- por ahora el empaquetado usa el icono por defecto de Electron hasta que definamos assets finales

## API principal

### Auth

- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/logout`

### Tareas

- `GET /api/v1/tasks/user/:userId`
- `POST /api/v1/tasks`
- `PUT /api/v1/tasks/:id`
- `DELETE /api/v1/tasks/:id`
- `PATCH /api/v1/tasks/:id/complete`
- `POST /api/v1/tasks/import-markdown`

### Sesiones Pomodoro

- `GET /api/v1/sessions/active/:userId`
- `POST /api/v1/sessions`
- `PATCH /api/v1/sessions/:id/pause`
- `PATCH /api/v1/sessions/:id/resume`
- `PATCH /api/v1/sessions/:id/finish`

## Reglas de Pomodoro implementadas

- Cada sesión de enfoque dura `25` minutos.
- Cada descanso corto dura `5` minutos.
- Cada 4 pomodoros terminados, el siguiente descanso es largo de `15` minutos.
- Se guarda trazabilidad por sesión en la tabla `pomodoro_sessions`.
- Cada tarea acumula `pomodoros_completed` y `total_focus_minutes`.

## Importar tareas desde Markdown

Se aceptan checklist items en Markdown. El proyecto se toma del heading actual.

Ejemplo en [tasks.example.md](/home/elyarestark/develop/pomodoro-frontend/tasks.example.md:1).

### Formato

```md
# Proyecto

- [ ] Tarea pendiente :: descripcion opcional
- [x] Tarea completada :: descripcion opcional
```

### 1. Crear cuenta

```sh
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Elya","email":"elya@example.com","password":"supersecret"}'
```

La respuesta incluye `token` y `user.id`.

### 2. Importar archivo usando el token

```sh
curl -X POST http://localhost:8080/api/v1/tasks/import-markdown \
  -H "Authorization: Bearer TU_TOKEN" \
  -F "file=@tasks.example.md"
```

### 3. Consultar tus tareas

```sh
curl http://localhost:8080/api/v1/tasks/user/TU_USER_ID \
  -H "Authorization: Bearer TU_TOKEN"
```
