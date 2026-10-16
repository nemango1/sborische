const DB_NAME = 'QuotesDB';
const DB_VERSION = 1;
let db;
let booksCache = []; // кэш книг для быстрого поиска автора

// Инициализация БД
function initDB() {
  const request = indexedDB.open(DB_NAME, DB_VERSION);

  request.onupgradeneeded = (e) => {
    const dbNew = e.target.result;
    // Хранилище книг: ключ по названию (уникальное)
    if (!dbNew.objectStoreNames.contains('books')) {
      const booksStore = dbNew.createObjectStore('books', { keyPath: 'title' });
      booksStore.createIndex('author', 'author', { unique: false });
    }
    // Хранилище цитат: ключ — автоинкремент
    if (!dbNew.objectStoreNames.contains('quotes')) {
      const quotesStore = dbNew.createObjectStore('quotes', { autoIncrement: true });
      quotesStore.createIndex('bookTitle', 'bookTitle', { unique: false });
    }
  };

  request.onsuccess = (e) => {
    db = e.target.result;
    renderAll();
  };

  request.onerror = (e) => console.error('Ошибка БД:', e.target.error);
}

// Добавление или обновление книги + цитаты
async function saveQuoteData(text, title, author, quoteIdToUpdate = null) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['books', 'quotes'], 'readwrite');
    const booksStore = tx.objectStore('books');
    const quotesStore = tx.objectStore('quotes');

    // 1. Сначала работаем с книгой
    const getBookReq = booksStore.get(title);
    getBookReq.onsuccess = () => {
      let bookRecord = getBookReq.result;
      
      // Если книги нет — создаём. Если есть — можно обновить автора, если он отличается
      if (!bookRecord) {
        bookRecord = { title, author };
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      } else if (bookRecord.author !== author) {
        // Если автор отличается — обновляем запись книги
        bookRecord.author = author;
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      }
      
      // 2. Теперь цитата
      const quoteData = { text, bookTitle: title };
      
      if (quoteIdToUpdate !== null) {
        // РЕДАКТИРОВАНИЕ существующей цитаты
        quoteData.id = quoteIdToUpdate;
        const putQuoteReq = quotesStore.put(quoteData);
        putQuoteReq.onsuccess = resolve;
        putQuoteReq.onerror = reject;
      } else {
        // ДОБАВЛЕНИЕ новой цитаты
        const addQuoteReq = quotesStore.add(quoteData);
        addQuoteReq.onsuccess = resolve;
        addQuoteReq.onerror = reject;
      }
    };
    
    getBookReq.onerror = reject;
  });
}

// Получение всех книг для фильтра
function getBooks(cb) {
  const tx = db.transaction('books', 'readonly');
  const store = tx.objectStore('books');
  const req = store.getAll();
  req.onsuccess = () => cb(req.result);
  req.onerror = (e) => console.error(e);
}

// Получение цитат (с фильтром)
function getQuotes(filterTitle, cb) {
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
  req.onerror = (e) => console.error(e);
}

// Рендер списка цитат и фильтра
function renderAll(filterTitle = '') {
  getBooks(books => {
    booksCache = books; // обновляем кэш

    const filterEl = document.getElementById('book-filter');
    filterEl.innerHTML = '<option value="">Все произведения</option>';
    books.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b.title;
      opt.textContent = `${b.title} (${b.author})`;
      filterEl.appendChild(opt);
    });

    getQuotes(filterTitle, quotes => {
      const listEl = document.getElementById('quotes-list');
      listEl.innerHTML = '';

      // Быстрый словарь: title -> author
      const authorMap = {};
      books.forEach(b => authorMap[b.title] = b.author);

      // Перемешиваем цитаты (опционально)
      for (let i = quotes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
      }

      quotes.forEach(q => {
        const li = document.createElement('li');
        li.className = 'quote-card';
        const author = authorMap[q.bookTitle] || 'Неизвестен';

        li.innerHTML = `
          <div class="quote-content">
            <p class="quote-text">${escapeHtml(q.text)}</p>
            <div class="book-info">${q.bookTitle} — ${author}</div>
          </div>

          <button type="button" class="edit-btn" data-id="${q.id}">✏️ Редактировать</button>
        `;

        listEl.appendChild(li);
      });
    });
  });
}

// --- Модалка и логика кнопок ---

const modal = document.getElementById('modal');
const addBtn = document.getElementById('add-btn');
const closeBtn = document.getElementById('close-modal');
const form = document.getElementById('add-quote-form');
const quoteTextInput = document.getElementById('quote-text');
const bookTitleInput = document.getElementById('book-title');
const authorNameInput = document.getElementById('author-name');

// Открытие модалки «Добавить»
addBtn.addEventListener('click', (e) => {
  e.preventDefault();
  // Сброс режима редактирования при открытии «Добавить»
  delete form.dataset.editId;
  quoteTextInput.value = '';
  bookTitleInput.value = '';
  authorNameInput.value = '';
  modal.classList.remove('hidden');
});

// Закрытие модалки
closeBtn.addEventListener('click', () => {
  modal.classList.add('hidden');
  delete form.dataset.editId; // сброс режима редактирования
  // Опционально: можно не очищать форму, если хочешь сохранять черновик
});

// Обработка формы (Добавить / Редактировать)
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const text = quoteTextInput.value.trim();
  const title = bookTitleInput.value.trim();
  const author = authorNameInput.value.trim();

  if (!text || !title) {
    alert('Заполните текст цитаты и название произведения');
    return;
  }

  const editId = form.dataset.editId ? Number(form.dataset.editId) : null;

  try {
    await saveQuoteData(text, title, author, editId);
    modal.classList.add('hidden');
    
    // Если редактировали — сбрасываем ID
    if (editId) {
      delete form.dataset.editId;
    } else {
      form.reset(); // очищаем только при добавлении новой
    }

    renderAll(); // перерисовываем всё (фильтр и список)
  } catch (err) {
    console.error(err);
    alert('Ошибка при сохранении');
  }
});

// Глобальный слушатель для кнопок «Редактировать» в карточках
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.edit-btn');
  if (!btn) return;

  const quoteId = Number(btn.getAttribute('data-id'));
  const tx = db.transaction('quotes', 'readonly');
  const req = tx.objectStore('quotes').get(quoteId);

  req.onsuccess = () => {
    const quote = req.result;
    if (!quote) return;

    // Заполняем форму данными
    quoteTextInput.value = quote.text;
    bookTitleInput.value = quote.bookTitle;
    authorNameInput.value = ''; // автора берём из книги, но можно оставить пустым или подтянуть

    // Сохраняем ID для режима редактирования
    form.dataset.editId = quote.id;

    // Открываем модалку
    modal.classList.remove('hidden');
  };

  req.onerror = (err) => console.error(err);
});

// Фильтр
document.getElementById('book-filter').addEventListener('change', (e) => {
  renderAll(e.target.value);
});

// Экранирование HTML (защита от XSS)
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
