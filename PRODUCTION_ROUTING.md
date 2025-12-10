# Production Routing Configuration

## Production Paths

In production mode, the application uses the following paths:

- **Home**: `/`
- **Link**: `/link`
- **BannerGen**: `/bannergen`
- **FluidDAM (SpotStudio)**: `/spotstudio`
- **API**: `/api`

## Development Paths

In development mode (unified entry on port 3000):

- **Home**: `/`
- **Link**: `/Banner_gen/link`
- **BannerGen**: `/Banner_gen/banner-batch`
- **FluidDAM**: `/FluidDAM`
- **API**: `/api`

In development mode (standalone):

- **Home**: `http://localhost:3000`
- **Link**: `http://localhost:5174/link`
- **BannerGen**: `http://localhost:5174/banner-batch`
- **FluidDAM**: `http://localhost:5173`
- **API**: `http://localhost:3001`

## Production Deployment

### Nginx Configuration Example

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # Home page (root)
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Link page (root level)
    location /link {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        rewrite ^/link$ /link break;
    }

    # BannerGen
    location /bannergen {
        proxy_pass http://localhost:5174;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        rewrite ^/bannergen(/.*)$ $1 break;
    }

    # FluidDAM (SpotStudio)
    location /spotstudio {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        rewrite ^/spotstudio(/.*)$ $1 break;
    }

    # API
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Build Commands

```bash
# Build root entry (home page)
cd /path/to/FluidDAM_Full
npm run build

# Build Banner_gen
cd Banner_gen
npm run build  # Output: dist/ with base /bannergen/

# Build FluidDAM
cd FluidDAM
npm run build  # Output: dist/ with base /spotstudio/
```

### Environment Variables

For production, you can set these environment variables:

```bash
VITE_BANNER_GEN_URL=/bannergen
VITE_FLUIDDAM_URL=/spotstudio
VITE_HOME_URL=/
```

## Automatic Detection

The navigation utilities automatically detect the environment:

1. **Production Mode**: Detected by `import.meta.env.MODE === 'production'` or when running on non-localhost without a port
2. **Unified Entry Mode**: Detected by port 3000 or paths starting with `/Banner_gen` or `/FluidDAM`
3. **Standalone Mode**: Direct access to individual ports (5174, 5173, 3001)

The navigation functions will automatically use the correct paths based on the detected mode.

