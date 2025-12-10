# Troubleshooting Proxy Issues

## Problem: Cannot access /Banner_gen, /FluidDAM, etc. through unified entry

### Solution

1. **Restart all development servers** after configuration changes:
   ```bash
   # Stop all servers first
   stop-all.bat
   
   # Then start again
   start-all.bat
   ```

2. **Check if all services are running**:
   - Unified Entry: http://localhost:3000
   - Banner_gen: http://localhost:5174
   - FluidDAM: http://localhost:5173
   - API Server: http://localhost:3001

3. **Verify proxy configuration**:
   - The unified entry (port 3000) should proxy:
     - `/Banner_gen/*` → `http://localhost:5174/*`
     - `/FluidDAM/*` → `http://localhost:5173/*`
     - `/link` → `http://localhost:5174/link`
     - `/api/*` → `http://localhost:3001/api/*`

4. **Test direct access first**:
   - http://localhost:5174 (Banner_gen standalone)
   - http://localhost:5173 (FluidDAM standalone)
   - If these work, the proxy should work too

5. **Check browser console** for any errors

6. **Clear browser cache** if needed

## Common Issues

### Issue: 404 Not Found
- **Cause**: React Router intercepting proxy paths
- **Fix**: Removed routes that intercept proxy paths in `src/App.tsx`

### Issue: Proxy not working
- **Cause**: Vite dev server needs restart after config changes
- **Fix**: Restart all servers

### Issue: Case sensitivity
- **Cause**: Path case mismatch
- **Fix**: Added both `/FluidDAM` and `/fluiddam` support

## Expected Behavior

After fix:
- ✅ http://localhost:3000 → Home page
- ✅ http://localhost:3000/Banner_gen → Banner_gen app
- ✅ http://localhost:3000/Banner_gen/link → Link page
- ✅ http://localhost:3000/FluidDAM → FluidDAM app
- ✅ http://localhost:3000/fluiddam → FluidDAM app (case-insensitive)

