document.addEventListener('DOMContentLoaded', function() {
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const cameraError = document.getElementById('camera-error');
    const instructions = document.getElementById('instructions');
    const fileUploadContainer = document.getElementById('file-upload-container');
    const fileInput = document.getElementById('qr-file-input');
    const resultsList = document.getElementById('results-list');
    const noResults = document.getElementById('no-results');
    const codesCount = document.getElementById('codes-count');
    const clearAllBtn = document.getElementById('clear-all');
    const copyAllBtn = document.getElementById('copy-all');
    const flashlightBtn = document.getElementById('flashlight');

    let stream = null;
    let scannedCodes = new Set();
    let codeReader = null;
    let flashlightOn = false;
    let mediaTrack = null;

    // Функция для управления фонариком
    async function toggleFlashlight() {
        // Проверяем, доступен ли фонарик по атрибуту
        if (flashlightBtn.getAttribute('data-torch-available') === 'false') {
            alert('Your device does not support flashlight');
            return;
        }
        
        if (!stream || stream.getVideoTracks().length === 0) {
            console.log('Camera not initialized, cannot toggle flashlight');
            alert('Camera not initialized. Please wait or try reloading the page.');
            return;
        }
        
        mediaTrack = stream.getVideoTracks()[0];
        
        // Проверяем поддержку фонарика
        const capabilities = mediaTrack.getCapabilities();
        if (!capabilities.torch) {
            // Если фонарик не поддерживается, показываем уведомление
            alert('Your device does not support flashlight');
            // Обновляем атрибут
            flashlightBtn.setAttribute('data-torch-available', 'false');
            flashlightBtn.classList.add('disabled');
            return;
        }
        
        flashlightOn = !flashlightOn;
        try {
            await mediaTrack.applyConstraints({
                advanced: [{ torch: flashlightOn }]
            });
            
            // Обновляем внешний вид кнопки
            if (flashlightOn) {
                flashlightBtn.classList.add('btn-warning');
                flashlightBtn.classList.remove('btn-outline-light');
                flashlightBtn.querySelector('i').className = 'fas fa-bolt me-1';
            } else {
                flashlightBtn.classList.remove('btn-warning');
                flashlightBtn.classList.add('btn-outline-light');
                flashlightBtn.querySelector('i').className = 'fas fa-bolt me-1';
            }
        } catch (err) {
            console.error('Error controlling flashlight:', err);
            flashlightOn = false; // Сбрасываем состояние при ошибке
            flashlightBtn.classList.remove('btn-warning');
            flashlightBtn.classList.add('btn-outline-light');
            flashlightBtn.querySelector('i').className = 'fas fa-bolt me-1';
            // Показываем сообщение об ошибке
            alert('Failed to control flashlight: ' + err.message);
        }
    }

    // Добавляем обработчик для кнопки фонарика
    flashlightBtn.addEventListener('click', toggleFlashlight);

    async function checkCameraSupport() {
        console.log('Checking camera support...');

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.log('MediaDevices API is not supported');
            throw new Error('Camera API is not supported in this browser');
        }

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            console.log('All devices:', devices);

            const cameras = devices.filter(device => device.kind === 'videoinput');
            console.log('Available cameras:', cameras.map(camera => ({
                label: camera.label || 'Unnamed camera',
                deviceId: camera.deviceId,
                kind: camera.kind
            })));

            if (cameras.length === 0) {
                console.log('No cameras found');
                throw new Error('No cameras found');
            }

            return cameras;
        } catch (error) {
            console.error('Error enumerating devices:', error);
            throw error;
        }
    }

    async function setupCamera() {
        try {
            const cameras = await checkCameraSupport();
            console.log('Setting up camera with available devices:', cameras.length);

            // Initialize ZXing
            const hints = new Map();
            hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
            hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
            codeReader = new ZXing.BrowserMultiFormatReader(hints);

            // Показываем кнопку фонарика всегда
            flashlightBtn.classList.remove('d-none');
            // По умолчанию считаем, что фонарик недоступен
            flashlightBtn.setAttribute('data-torch-available', 'false');

            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { 
                        facingMode: "environment",
                        width: 640,
                        height: 480
                    }
                });
                console.log('Camera initialized with resolution:', {
                    width: stream.getVideoTracks()[0].getSettings().width,
                    height: stream.getVideoTracks()[0].getSettings().height
                });
                
                // Проверяем поддержку фонарика, но не скрываем кнопку
                if (stream && stream.getVideoTracks().length > 0) {
                    const track = stream.getVideoTracks()[0];
                    const capabilities = track.getCapabilities();
                    
                    // Если фонарик не поддерживается, делаем кнопку неактивной
                    if (!capabilities.torch) {
                        // Делаем кнопку визуально неактивной, но оставляем видимой
                        flashlightBtn.classList.add('disabled');
                        flashlightBtn.setAttribute('data-torch-available', 'false');
                    } else {
                        flashlightBtn.classList.remove('disabled');
                        flashlightBtn.setAttribute('data-torch-available', 'true');
                    }
                }
            } catch (err) {
                console.log('Failed to use main camera, switching to fallback:', err);
                stream = await navigator.mediaDevices.getUserMedia({
                    video: {
                        width: 640,
                        height: 480
                    }
                });
                console.log('Successfully initialized fallback camera');
                
                // Проверяем поддержку фонарика на запасной камере, но не скрываем кнопку
                if (stream && stream.getVideoTracks().length > 0) {
                    const track = stream.getVideoTracks()[0];
                    const capabilities = track.getCapabilities();
                    
                    if (!capabilities.torch) {
                        // Делаем кнопку визуально неактивной, но оставляем видимой
                        flashlightBtn.classList.add('disabled');
                        flashlightBtn.setAttribute('data-torch-available', 'false');
                    } else {
                        flashlightBtn.classList.remove('disabled');
                        flashlightBtn.setAttribute('data-torch-available', 'true');
                    }
                }
            }

            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            await video.play();

            // Setup ZXing handler
            codeReader.decodeFromVideoDevice(undefined, video, (result, err) => {
                if (result && !scannedCodes.has(result.getText())) {
                    handleSuccess(result.getText());
                }
                if (err && !(err instanceof ZXing.NotFoundException)) {
                    console.error('Decoding error:', err);
                }
            });

            cameraError.classList.add('d-none');
            instructions.classList.remove('d-none');
            fileUploadContainer.classList.add('d-none');

        } catch (err) {
            console.error('Camera setup error:', err);
            handleCameraError(err);
        }
    }

    function handleSuccess(data) {
        if (scannedCodes.has(data)) return;
        scannedCodes.add(data);

        const displayData = data.includes('=') ? data.split('=')[1] : data;

        const resultItem = document.createElement('div');
        resultItem.className = 'list-group-item slide-in';
        resultItem.innerHTML = `
            <div class="d-flex justify-content-between align-items-center w-100">
                <div class="text-truncate">${displayData}</div>
                <div class="btn-group ms-auto">
                    <button class="btn btn-sm btn-outline-light copy-btn" title="Copy">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-light delete-btn" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;

        resultItem.querySelector('.copy-btn').addEventListener('click', () => {
            navigator.clipboard.writeText(displayData)
                .then(() => {
                    const icon = resultItem.querySelector('.copy-btn i');
                    icon.className = 'fas fa-check';
                    setTimeout(() => {
                        icon.className = 'fas fa-copy';
                    }, 1000);
                });
        });

        resultItem.querySelector('.delete-btn').addEventListener('click', () => {
            scannedCodes.delete(data);
            resultItem.classList.add('fade-out');
            setTimeout(() => {
                resultItem.remove();
                updateResultsView();
            }, 200);
        });

        // Сохраняем положение прокрутки
        const scrollY = window.scrollY;
        
        // Добавляем элемент в начало списка и обновляем вид
        resultsList.insertBefore(resultItem, resultsList.firstChild);
        updateResultsView();
        
        // Восстанавливаем положение прокрутки
        window.scrollTo(0, scrollY);
    }

    function updateResultsView() {
        const count = scannedCodes.size;
        codesCount.textContent = count;
        noResults.style.display = count === 0 ? 'block' : 'none';
        copyAllBtn.disabled = count === 0;
    }

    function handleCameraError(error) {
        console.error('Camera access error:', error);
        cameraError.classList.remove('d-none');
        instructions.classList.add('d-none');
        fileUploadContainer.classList.remove('d-none');
    }

    // Event handlers
    copyAllBtn.addEventListener('click', () => {
        const allResults = Array.from(resultsList.children)
            .map(item => item.querySelector('.text-truncate').textContent)
            .join('\n');

        navigator.clipboard.writeText(allResults)
            .then(() => {
                const originalText = copyAllBtn.innerHTML;
                copyAllBtn.innerHTML = '<i class="fas fa-check me-1"></i>Copied!';
                setTimeout(() => {
                    copyAllBtn.innerHTML = originalText;
                }, 1000);
            });
    });

    clearAllBtn.addEventListener('click', () => {
        scannedCodes.clear();
        resultsList.innerHTML = '';
        updateResultsView();
    });

    // File upload handling
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;

        Array.from(e.target.files).forEach(file => {
            if (!file.type.match('image.*')) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                const img = new Image();
                img.onload = async () => {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    const ctx = canvas.getContext('2d', { alpha: false });
                    ctx.drawImage(img, 0, 0);
                    
                    try {
                        const hints = new Map();
                        hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.QR_CODE]);
                        hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
                        
                        // Create temporary HTML img element for ZXing
                        const tmpImg = document.createElement('img');
                        tmpImg.src = event.target.result;
                        document.body.appendChild(tmpImg);
                        
                        try {
                            // Use BrowserMultiFormatReader to decode the image
                            const result = await codeReader.decodeFromImage(tmpImg);
                            if (result) {
                                handleSuccess(result.getText());
                            }
                        } catch (error) {
                            console.error('QR code decoding error:', error);
                        } finally {
                            // Remove temporary element
                            document.body.removeChild(tmpImg);
                        }
                    } catch (err) {
                        console.error('Image processing error:', err);
                    }
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        });

        // Reset value to allow uploading the same file again
        fileInput.value = '';
    });

    window.addEventListener('beforeunload', () => {
        if (stream) {
            // Отключаем фонарик перед закрытием
            if (flashlightOn && mediaTrack) {
                try {
                    mediaTrack.applyConstraints({
                        advanced: [{ torch: false }]
                    });
                } catch (err) {
                    console.error('Error disabling flashlight:', err);
                }
            }
            
            stream.getTracks().forEach(track => track.stop());
        }
        
        // Stop ZXing scanner
        if (codeReader) {
            codeReader.reset();
        }
    });

    // Initialization
    setupCamera();
});
