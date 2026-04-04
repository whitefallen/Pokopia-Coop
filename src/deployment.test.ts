import { describe, expect, it } from 'vitest'
import dockerfile from '../Dockerfile?raw'
import composeFile from '../docker-compose.yml?raw'
import nginxConfig from '../docker/nginx.conf?raw'
import readme from '../README.md?raw'

describe('docker deployment artifacts', () => {
  it('uses nginx runtime with SPA fallback and compose port 4173 mapping', () => {
    expect(dockerfile).toContain('FROM node:22-alpine AS runtime')
    expect(dockerfile).toContain('COPY --from=build /app/dist /app/dist')
    expect(dockerfile).toContain('COPY server.mjs /app/server.mjs')
    expect(dockerfile).toContain('CMD ["npm", "run", "start"]')
    expect(dockerfile).toContain('EXPOSE 4173')

    expect(composeFile).toContain('dockerfile: Dockerfile')
    expect(composeFile).toContain("- '4173:4173'")

    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html;')
  })

  it('documents docker compose deployment command without localhost-only URL assumptions', () => {
    expect(readme).toContain('## Docker Compose deployment')
    expect(readme).toContain('docker compose up --build -d')
    expect(readme).toContain('docker compose down')
    expect(readme).toContain('port `4173` of the host where you run Docker Compose')
    expect(readme).not.toContain('http://localhost:4173')
  })
})
