//const DB_NAME = 'QuotesDB';
//const DB_VERSION = 1;
//let db;
//let booksCache = []; // кэш книг для быстрого поиска автора
let quotes = []; // Обязательно объявляем массив глобально
const DB_NAME = 'QuotesDB';
const DB_VERSION = 1;
const STORE_NAME = 'quotes';

// --- Элементы DOM (объявляем заранее, но используем после проверки) ---
const modalEl = document.getElementById('modal');
const addBtn = document.getElementById('add-btn');
const closeBtn = document.getElementById('close-modal');
const formEl = document.getElementById('add-quote-form');
const quoteTextInput = document.getElementById('quote-text');
const bookTitleInput = document.getElementById('book-title');
const authorNameInput = document.getElementById('author-name');
const filterEl = document.getElementById('book-filter');

// Инициализация БД
function initDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (e) => {
    const db = e.target.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
    }
  };

  request.onsuccess = (e) => {
    console.log('✅ База данных успешно открыта');
    const db = e.target.result;
    
    // Читаем все цитаты сразу при старте
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();

    req.onsuccess = () => {
      quotes = req.result; // ГЛАВНОЕ: записываем данные в глобальную переменную quotes
      renderAll(); // И сразу рисуем
    };
  };

  request.onerror = (e) => console.error('❌ Ошибка открытия БД', e);
}


// Добавление или обновление книги + цитаты
async function saveQuoteData(text, title, author, quoteIdToUpdate = null) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('База данных не инициализирована'));
      return;
    }

    const tx = db.transaction(['books', 'quotes'], 'readwrite');
    const booksStore = tx.objectStore('books');
    const quotesStore = tx.objectStore('quotes');

    const getBookReq = booksStore.get(title);
    
    getBookReq.onsuccess = () => {
      let bookRecord = getBookReq.result;
      
      if (!bookRecord) {
        bookRecord = { title, author };
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      } else if (bookRecord.author !== author) {
        bookRecord.author = author;
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      }
      
      const quoteData = { text, bookTitle: title };
      
      if (quoteIdToUpdate !== null) {
        quoteData.id = quoteIdToUpdate;
        const putQuoteReq = quotesStore.put(quoteData);
        putQuoteReq.onsuccess = resolve;
        putQuoteReq.onerror = reject;
      } else {
        const addQuoteReq = quotesStore.add(quoteData);
        addQuoteReq.onsuccess = resolve;
        addQuoteReq.onerror = reject;
      }
    };
    
    getBookReq.onerror = reject;
  });
}

function getBooks(cb) {
  if (!db) return cb(); // ✅ Возвращаем пустой массив, а не undefined
  const tx = db.transaction('books', 'readonly');
  const store = tx.objectStore('books');
  const req = store.getAll();
  req.onsuccess = () => cb(req.result);
  req.onerror = (e) => { console.error(e); cb(); };
}

function getQuotes(filterTitle, cb) {
  if (!db) return cb(); // ✅ Возвращаем пустой массив
  const tx = db.transaction('quotes', 'readonly');
  const store = tx.objectStore('quotes');
  const req = store.getAll();
  req.onsuccess = () => {
    let list = req.result;
    if (filterTitle) {
      list = list.filter(q => q.bookTitle === filterTitle);
    }
    cb(list);
  };
  req.onerror = (e) => { console.error(e); cb(); };
}


function renderAll() {
  const list = document.getElementById('quotes-list');
  if (!list) return;
  
  list.innerHTML = ''; // Очищаем список
  
  // Если массив пуст, выходим
  if (quotes.length === 0) {
    list.innerHTML = '<li>Пока нет цитат. Добавь первую!</li>';
    return;
  }

  quotes.forEach(quote => { // Важно: здесь переменная quote (единственное число)
    const li = document.createElement('li');
    
    const textSpan = document.createElement('span');
    textSpan.textContent = quote.text;
    
    const editBtn = document.createElement('button');
    editBtn.textContent = 'Редактировать';
    editBtn.dataset.id = quote.id; // Вот тут мы вешаем ID
    editBtn.onclick = () => openEditModal(quote.id);
    
    li.appendChild(textSpan);
    li.appendChild(editBtn);
    list.appendChild(li);
  });
}


// --- Настройка слушателей для редактирования ---
function setupEditListeners() {
  // Проверка, что DOM элементы существуют
  if (!modalEl || !formEl || !quoteTextInput || !bookTitleInput || !authorNameInput) {
    console.warn('Элементы модального окна ещё не загружены в DOM');
    return;
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-btn');
    if (!btn) return;

    const idAttr = btn.getAttribute('data-id');

    // 1. Проверка наличия атрибута
    if (!idAttr) {
      console.error('Ошибка: у кнопки редактирования отсутствует атрибут data-id');
      alert('Техническая ошибка: кнопка редактирования не имеет ID');
      return;
    }

    // 2. Проверка валидности числа
    const quoteId = Number(idAttr);
    if (Number.isNaN(quoteId)) {
      console.error('Ошибка: data-id не является числом. Получено:', idAttr);
      alert('Техническая ошибка: некорректный ID цитаты');
      return;
    }

    // 3. Проверка инициализации БД
    if (!db) {
      console.error('Ошибка: база данных ещё не готова. Попробуйте обновить страницу.');
      alert('База данных загружается... подождите пару секунд и попробуйте снова.');
      return;
    }

    // Запрос к базе
    const tx = db.transaction('quotes', 'readonly');
    const req = tx.objectStore('quotes').get(quoteId);

    req.onsuccess = () => {
      const quote = req.result;
      if (!quote) {
        console.error('Цитата с ID', quoteId, 'не найдена в базе');
        alert('Цитата была удалена или не найдена');
        return;
      }
      

      // Заполняем форму
      quoteTextInput.value = quote.text;
      bookTitleInput.value = quote.bookTitle;
      
      // Автоматически подставляем автора из кэша книг
      const book = booksCache.find(b => b.title === quote.bookTitle);
      authorNameInput.value = book ? book.author : '';

      // Сохраняем ID для режима редактирования
      formEl.dataset.editId = quote.id;

      // Открываем модалку
      modalEl.classList.remove('hidden');
    };

    req.onerror = (err) => {
      console.error('Ошибка при получении цитаты для редактирования:', err);
      alert('Не удалось загрузить цитату для редактирования');
    };
  });
}

// --- Логика модального окна (Добавить) ---
if (addBtn) {
  addBtn.addEventListener('click', (e) => {
    e.preventDefault();
    delete formEl.dataset.editId;
    quoteTextInput.value = '';
    bookTitleInput.value = '';
    authorNameInput.value = '';
    if (modalEl) modalEl.classList.remove('hidden');
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    if (modalEl) modalEl.classList.add('hidden');
    delete formEl.dataset.editId;
  });
}

if (formEl) {
  formEl.addEventListener('submit', async (e) => {
    e.preventDefault();

    const text = quoteTextInput.value.trim();
    const title = bookTitleInput.value.trim();
    const author = authorNameInput.value.trim();

    if (!text || !title) {
      alert('Заполните текст цитаты и название произведения');
      return;
    }

    const editId = formEl.dataset.editId ? Number(formEl.dataset.editId) : null;

    try {
      await saveQuoteData(text, title, author, editId);
      
      if (modalEl) modalEl.classList.add('hidden');
      
      if (editId) {
        delete formEl.dataset.editId;
      } else {
        formEl.reset();
      }

      renderAll();
    } catch (err) {
      console.error(err);
      alert('Ошибка при сохранении: ' + err.message);
    }
  });
}

// Слушатель фильтра
if (filterEl) {
  filterEl.addEventListener('change', (e) => {
    renderAll(e.target.value);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

initDB();
