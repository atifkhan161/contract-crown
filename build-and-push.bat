@echo off
echo ========================================
echo Contract Crown - Build and Push Script
echo ========================================

echo.
echo [1/4] Building client...
cd client
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ERROR: Client build failed!
    exit /b 1
)
cd ..

echo.
echo [2/4] Building Docker image...
docker image build --pull --file ./Dockerfile --tag 192.168.1.100:5000/contractcrown:latest --label com.microsoft.created-by=build-script . --platform linux/arm64
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker build failed!
    exit /b 1
)

echo.
echo [3/4] Tagging image for local registry...
docker tag 192.168.1.100:5000/contractcrown:latest contractcrown:latest

echo.
echo [4/4] Pushing to local registry...
docker push 192.168.1.100:5000/contractcrown:latest
if %ERRORLEVEL% neq 0 (
    echo ERROR: Docker push failed!
    echo Make sure your Pi registry is running at 192.168.1.100:5000
    exit /b 1
)

echo.
echo ========================================
echo Build and push completed successfully!
echo Image: 192.168.1.100:5000/contractcrown:latest
echo ========================================