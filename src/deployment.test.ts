import { describe, expect, it } from 'vitest'
import dockerfile from '../Dockerfile?raw'
import composeFile from '../docker-compose.yml?raw'
import nginxConfig from '../docker/nginx.conf?raw'
import readme from '../README.md?raw'

describe('docker deployment artifacts', () => {
  it('uses nginx runtime with SPA fallback and compose port 4173 mapping', () => {
    expect(dockerfile).toContain('FROM nginx:1.29-alpine AS runtime')
    expect(dockerfile).toContain('COPY docker/nginx.conf /etc/nginx/conf.d/default.conf')
    expect(dockerfile).toContain('COPY --from=build /app/dist /usr/share/nginx/html')
    expect(dockerfile).toContain('EXPOSE 4173')

    expect(composeFile).toContain('dockerfile: Dockerfile')
    expect(composeFile).toContain("- '4173:4173'")

    expect(nginxConfig).toContain('listen 4173;')
    expect(nginxConfig).toContain('try_files $uri $uri/ /index.html;')
  })

  it('documents docker compose deployment command', () => {
    expect(readme).toContain('## Docker Compose deployment')
    expect(readme).toContain('docker compose up --build -d')
    expect(readme).toContain('docker compose down')
  })
})
