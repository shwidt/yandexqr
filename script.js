const video = document.getElementById('camera');
const output = document.getElementById('output');
const copyButton = document.getElementById('copyButton');
const flashButton = document.getElementById('flashButton');
const loading = document.getElementById('loading');
const highlight = document.getElementById('highlight');
const scanSound = document.getElementById('scanSound');
const captureButton = document.getElementById('captureButton');
const photoInfo = document.getElementById('photoInfo');
let scannedData = [];
let stream = null;
let track = null;
let isFlashOn = false;
let currentDropdown = null;
let model;

// Инициализация ZXing
const codeReader = new ZXing.BrowserQRCodeReader();

// Для хранения уникальных значений
const uniqueValues = new Set();

// Временная блокировка для предотвращения повторного сканирования
let lastScannedData = null;
let lastScanTime = 0;
const SCAN_COOLDOWN = 2000; // 2 секунды

async function loadModel() {
    model = await mobilenet.load();
    console.log("Модель MobileNet загружена.");
}

async function classifyImage(imageElement) {
    if (!model) {
        console.error("Модель не загружена.");
        return;
    }

    const predictions = await model.classify(imageElement);
    console.log("Результаты классификации:", predictions);
    return predictions;
}

async function initCamera() {
    const video = document.getElementById('camera');
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 600, height: 1000 } });
    video.srcObject = stream;
    video.play();
    
    // Убедитесь, что размеры видео фиксированы через CSS
    // Эти строки можно убрать, если размеры уже заданы в CSS
    video.style.width = '100%'; 
    video.style.height = '100%'; 
}

async function startCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');

        if (videoDevices.length === 0) {
            throw new Error("Камера не найдена.");
        }

        let rearCamera = null;
        for (const device of videoDevices) {
            if (device.label.toLowerCase().includes("back") || device.label.toLowerCase().includes("rear")) {
                rearCamera = device;
                break;
            }
        }

        const deviceId = rearCamera ? rearCamera.deviceId : videoDevices[0].deviceId;

        // Увеличиваем частоту сканирования
        codeReader.decodeFromVideoDevice(deviceId, video, (result, err) => {
            if (result) {
                handleScanResult(result.text);
            }
            if (err && !(err instanceof ZXing.NotFoundException)) {
                console.error("Ошибка сканирования:", err);
            }
        });

        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                deviceId: { exact: deviceId },
                facingMode: { ideal: "environment" }
            }
        });
        track = stream.getVideoTracks()[0];
        video.srcObject = stream;
    } catch (error) {
        console.error("Ошибка доступа к камере:", error);
        output.innerHTML = `<h3>Ошибка:</h3><p>Не удалось получить доступ к камере. Разрешите доступ в настройках.</p>`;
    }
}

function handleScanResult(data) {
    console.log("Сканированный результат:", data);
    const currentTime = Date.now();

    // Проверка на временную блокировку
    if (data === lastScannedData && (currentTime - lastScanTime) < SCAN_COOLDOWN) {
        return; // Игнорируем повторное сканирование того же QR-кода
    }

    lastScannedData = data;
    lastScanTime = currentTime;

    // Проверка на дубликаты
    if (!uniqueValues.has(data)) {
        uniqueValues.add(data); // Добавляем значение в Set

        if (data.includes("go.yandex")) {
            const extractedData = data.split("=")[1] || data;
            scannedData.push({ value: extractedData, suffix: "" });
        } else {
            scannedData.push({ value: "Неверный QR-код", suffix: "" });
        }
        renderScannedData(); // Обновляем отображение
        loading.style.display = 'none';
        scanSound.play();

        // Вибрация при успешном сканировании
        if (navigator.vibrate) {
            navigator.vibrate(200); // Вибрация на 200 мс
        }
    }
}

function renderScannedData() {
    console.log("Обновление данных для отображения:", scannedData);
    output.innerHTML = `<h3>Результат сканирования:</h3>`;
    if (scannedData.length === 0) {
        output.innerHTML += `<p>Нет данных для отображения.</p>`;
    } else {
        scannedData.forEach((item, index) => {
            const scanItem = document.createElement("div");
            scanItem.classList.add("scan-item");

            const text = document.createElement("span");
            text.classList.add("scan-text");
            text.textContent = item.suffix ? `${item.value} ${item.suffix}` : item.value;

            const buttonsDiv = document.createElement("div");
            buttonsDiv.classList.add("scan-buttons");

            const addPrefixButton = document.createElement("button");
            addPrefixButton.classList.add("btn-prefix");
            addPrefixButton.innerHTML = '<i class="fas fa-tag"></i> Добавить префикс';
            addPrefixButton.onclick = (e) => {
                e.stopPropagation();
                togglePrefixList(index, e);
            };

            const deleteButton = document.createElement("button");
            deleteButton.innerHTML = '<i class="fas fa-trash"></i> Удалить';
            deleteButton.classList.add("btn-delete");
            deleteButton.onclick = () => {
                // Удаляем значение из Set и массива
                uniqueValues.delete(scannedData[index].value);
                scannedData.splice(index, 1);
                renderScannedData(); // Обновляем отображение после удаления
                // Перезапускаем камеру для повторного сканирования
                startCamera(); // Убедитесь, что камера перезапускается
            };

            buttonsDiv.appendChild(addPrefixButton);
            buttonsDiv.appendChild(deleteButton);

            scanItem.appendChild(text);
            scanItem.appendChild(buttonsDiv);
            output.appendChild(scanItem);
        });
    }
}

function togglePrefixList(index, event) {
    if (currentDropdown) {
        currentDropdown.classList.remove("show");
        currentDropdown = null;
        return;
    }

    let dropdown = document.createElement("div");
    dropdown.classList.add("prefix-dropdown");
    dropdown.classList.add("show");

    const prefixes = ["Рел", "Раскладушка", "Труп", "Грязный"];
    prefixes.forEach(prefix => {
        const button = document.createElement("button");
        button.textContent = prefix;
        button.onclick = () => {
            scannedData[index].suffix = prefix;
            renderScannedData();
            dropdown.classList.remove("show");
            currentDropdown = null;
        };
        dropdown.appendChild(button);
    });

    // Позиционируем меню под кнопкой
    const buttonRect = event.target.getBoundingClientRect();
    dropdown.style.top = `${buttonRect.bottom + window.scrollY + 5}px`; // 5px отступ
    dropdown.style.left = `${buttonRect.left + window.scrollX}px`;

    document.body.appendChild(dropdown);
    currentDropdown = dropdown;

    const closeDropdown = (e) => {
        if (!dropdown.contains(e.target) && e.target !== event.target) {
            dropdown.classList.remove("show");
            document.removeEventListener("click", closeDropdown);
            currentDropdown = null;
        }
    };
    document.addEventListener("click", closeDropdown);
}

// Добавим анимацию при нажатии на кнопки
function animateButton(button) {
    button.classList.add('active');
    setTimeout(() => {
        button.classList.remove('active');
    }, 200); // Время анимации
}

// Применяем анимацию к кнопкам
copyButton.addEventListener('click', () => {
    animateButton(copyButton); // Анимация кнопки
    const textToCopy = scannedData.map(item => item.suffix ? `${item.value} ${item.suffix}` : item.value).join("\n");
    navigator.clipboard.writeText(textToCopy).then(() => {
        alert("Данные скопированы!");
    });
});

flashButton.addEventListener('click', async () => {
    animateButton(flashButton); // Анимация кнопки
    if (!track) return alert("Фонарик не поддерживается на этом устройстве.");
    try {
        isFlashOn = !isFlashOn;
        await track.applyConstraints({ advanced: [{ torch: isFlashOn }] });
        flashButton.innerHTML = isFlashOn ? '<i class="fas fa-lightbulb"></i> Выключить фонарик' : '<i class="fas fa-lightbulb"></i> Включить фонарик';
    } catch {
        alert("Ошибка управления фонариком.");
    }
});

async function startCameraWithClassification() {
    await startCamera();
    await loadModel();

    // Классификация выполняется, но результаты не отображаются
    setInterval(async () => {
        await classifyImage(video);
    }, 5000); // Классификация каждые 5 секунд
}

startCameraWithClassification();

// Функция для захвата фото
function capturePhoto() {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    // Получаем фактические размеры видео
    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Определяем разрешение в зависимости от устройства
    const devicePixelRatio = window.devicePixelRatio || 1; // Получаем плотность пикселей
    const photoWidth = Math.floor(videoWidth * devicePixelRatio); // Ширина фото с учетом плотности
    const photoHeight = Math.floor(videoHeight * devicePixelRatio); // Высота фото с учетом плотности
    canvas.width = photoWidth;
    canvas.height = photoHeight;

    // Рисуем изображение с видео, масштабируя его
    context.drawImage(video, 0, 0, photoWidth, photoHeight);

    // Получаем текущую дату и время
    const now = new Date();
    const options = { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false };
    const timestamp = now.toLocaleString('ru-RU', options).replace(',', ''); // Форматируем дату и время

    // Получаем геолокацию
    navigator.geolocation.getCurrentPosition(async (position) => {
        const { latitude, longitude } = position.coords;
        const geoInfo = `Широта: ${latitude.toFixed(4)}, Долгота: ${longitude.toFixed(4)}`;

        // Получаем адрес по координатам
        const address = await getAddress(latitude, longitude);

        // Добавляем текст на изображение
        context.fillStyle = 'white'; // Цвет текста
        context.font = '20px Arial'; // Шрифт текста
        context.fillText(`Фото сделано: ${timestamp}`, 10, 30); // Время и дата
        context.fillText(geoInfo, 10, 60); // Геолокация
        context.fillText(`Адрес: ${address}`, 10, 90); // Адрес

        // Получаем данные изображения в формате base64
        const photoData = canvas.toDataURL('image/png');

        // Создаем ссылку для скачивания
        const link = document.createElement('a');
        link.href = photoData;
        link.download = `photo_${timestamp}.png`; // Имя файла
        link.click(); // Имитируем клик для скачивания

        // Обновляем информацию о фото
        photoInfo.innerHTML = `<p>Фото сделано: ${timestamp}</p><p>${geoInfo}</p><p>Адрес: ${address}</p>`;
    });
}

// Функция для получения адреса по координатам
async function getAddress(latitude, longitude) {
    const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
    const data = await response.json();
    
    // Извлекаем только улицу, дом и город
    const street = data.address.road || '';
    const houseNumber = data.address.house_number ? `, ${data.address.house_number}` : '';
    const city = data.address.city || data.address.town || data.address.village || '';

    return `${street}${houseNumber}, ${city}`.trim() || 'Адрес не найден';
}

// Добавляем обработчик события для кнопки захвата фото
captureButton.addEventListener('click', capturePhoto);

// Вызов функции инициализации камеры
initCamera();
