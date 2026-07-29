# Slideshow Studio

사진 폴더를 세로형 슬라이드쇼 영상으로 변환하는 Windows용 도구입니다.

## 기능

- 폴더 안의 사진을 시간순으로 정렬해 MP4 영상으로 변환
- 사진당 표시 시간 설정
- 배경색 설정
- 그림자 on/off, blur, distance, opacity 조절
- 출력 형식: `MP4 / H.264`

## 사용 방법

현재 배포된 설치 파일은 없습니다. 아래 `소스코드로 실행하기`를 따라 실행합니다.

실행한 뒤에는 사진 폴더를 선택하고 옵션을 조절한 뒤 `Make Video`를 누르면 됩니다. 출력 영상은 선택한 사진 폴더 안에 `폴더이름_slideshow.mp4` 형식으로 저장됩니다.

## 소스코드로 실행하기

### 1. 저장소 받기

```bat
git clone https://github.com/KAIKIM2026/slideshow-studio.git
cd slideshow-studio
```

여기서 받은 폴더가 저장소 루트입니다. Electron 앱 소스는 그 안의 `slideshow-studio` 폴더에 있습니다.

### 2. ffmpeg 준비

`ffmpeg.exe`는 용량 때문에 저장소에 포함되어 있지 않습니다. 받은 직후에는 앱이 실행되지 않으므로 이 단계를 먼저 끝내야 합니다.

Electron 앱이 찾는 위치는 `slideshow-studio/ffmpeg/ffmpeg.exe` 한 곳입니다.

저장소 루트에서 PowerShell로 아래를 그대로 실행하면 됩니다.

```powershell
cd slideshow-studio
$ProgressPreference = 'SilentlyContinue'
Invoke-WebRequest "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile "ffmpeg.zip"
Expand-Archive "ffmpeg.zip" -DestinationPath "ffmpeg-tmp" -Force
New-Item -ItemType Directory -Force "ffmpeg" | Out-Null
Copy-Item (Get-ChildItem "ffmpeg-tmp" -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1).FullName "ffmpeg\ffmpeg.exe"
Remove-Item "ffmpeg.zip", "ffmpeg-tmp" -Recurse -Force
```

이미 ffmpeg가 설치되어 있다면 내려받는 대신 복사만 해도 됩니다.

```powershell
New-Item -ItemType Directory -Force "ffmpeg" | Out-Null
Copy-Item (Get-Command ffmpeg).Source "ffmpeg\ffmpeg.exe"
```

준비가 끝났는지 확인합니다.

```powershell
.\ffmpeg\ffmpeg.exe -version
```

`ffmpeg version 8.x` 가 출력되면 정상입니다. 이 명령이 실패하면 앱은 실행되어도 영상 변환에서 반드시 실패합니다.

다른 위치의 ffmpeg를 쓰려면 `SLIDESHOW_FFMPEG_PATH` 환경 변수에 `ffmpeg.exe`의 전체 경로를 지정하면 됩니다. 이 값이 위 경로보다 우선합니다.

### 3. Electron 버전 실행

```bat
cd slideshow-studio
run.bat
```

`run.bat`이 ffmpeg 존재 확인과 `npm install`까지 처리합니다. 직접 실행하려면 아래와 같이 합니다.

```bat
npm install
npm start
```

### 4. Python 버전 실행 (선택)

`slideshow_maker.py`는 tkinter로 만든 별도의 단독 버전입니다. Electron 앱과 무관하며 ffmpeg 위치도 다릅니다. 저장소 루트에 `ffmpeg-8.1-essentials_build/bin/ffmpeg.exe`가 있어야 합니다.

```bat
python slideshow_maker.py
```

## 빌드 방법

### Electron 앱 배포 파일 만들기

현재 `npm run dist:win`은 그대로 실행되지 않습니다. `package.json`의 빌드 설정이 예전 Python 백엔드 구조에 맞춰져 있어서 두 곳이 실제와 어긋나 있습니다.

- `dist:win`이 `build:backend`(PyInstaller)를 먼저 실행하지만, 앱은 더 이상 Python 백엔드를 쓰지 않습니다.
- `extraResources`의 ffmpeg 경로가 `../ffmpeg-8.1-essentials_build/bin/ffmpeg.exe`로 되어 있지만, 실제 위치는 `slideshow-studio/ffmpeg/ffmpeg.exe`입니다.

설치 파일이 필요하면 이 두 항목을 먼저 정리해야 합니다. 소스 실행은 위 방법으로 정상 동작합니다.

## GitHub Releases 업로드

배포 파일은 저장소 파일 목록에 직접 넣기보다 `Releases`에 올리는 것을 권장합니다.

1. GitHub 저장소 메인 페이지로 이동합니다.
2. 오른쪽의 `Releases` 또는 상단의 `Create a new release`를 누릅니다.
3. 태그를 만들고 제목을 입력합니다.
4. `Attach binaries` 또는 파일 업로드 영역에 설치 파일과 ZIP을 올립니다.
5. `Publish release`를 누릅니다.

권장 업로드 대상:

- 설치 파일 `.exe`
- 포터블 `.zip`

## 개발 메모

- 앱 표시 이름은 `Slideshow Studio`입니다.
- Electron 소스는 `slideshow-studio` 폴더에 있습니다.
- 실제 렌더링은 `slideshow-studio/src/main/render.js`에서 ffmpeg를 직접 호출해 처리합니다. 실행에 Python은 필요하지 않습니다.
- `slideshow-studio/src/python/slideshow_backend.py`와 `scripts/build-backend.ps1`은 예전 Python 백엔드 구조의 잔재이며 현재 호출되지 않습니다.
