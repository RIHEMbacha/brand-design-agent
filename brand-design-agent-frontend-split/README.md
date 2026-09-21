# Brand Design Agent — Angular Frontend

Angular 19 standalone frontend for an AI interface-generation workspace, inspired by the uploaded presentation: soft violet/blue gradients, bright white surfaces, rounded cards, compact navigation, and a visual-first dashboard.

## Screens

- `/auth/login` — Gmail + password only
- `/auth/signup` — Gmail + password + password confirmation
- `/projects` — project list and create project flow
- `/projects/:id` — interface list, prompt, file/ZIP upload, generated design, code and JSON tabs, regenerate, code download and ZIP download

## Backend integration points

`ProjectService` currently provides mock data. Replace these methods with `HttpClient` calls to your API:

- `GET /projects`
- `GET /projects/:id`
- `POST /projects`
- `POST /projects/:id/interfaces`
- `POST /projects/:id/files`
- `POST /projects/:id/generate`

The `GeneratedResult` model is the expected frontend shape for a backend JSON response containing `design`, `code` and `zipName`.

## Run

```bash
npm install
npm start
```

Then open `http://localhost:4200`.

