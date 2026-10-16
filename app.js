const DB_NAME = 'QuotesDB';
const DB_VERSION = 1;
let db;
let booksCache = []; 

// --- Элементы DOM ---
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
    const dbNew = e.target.result;
    
    if (!dbNew.objectStoreNames.contains('books')) {
      const booksStore = dbNew.createObjectStore('books', { keyPath: 'title' });
      booksStore.createIndex('author', 'author', { unique: false });
    }
    
    if (!dbNew.objectStoreNames.contains('quotes')) {
      const quotesStore = dbNew.createObjectStore('quotes', { autoIncrement: true });
      quotesStore.createIndex('bookTitle', 'bookTitle', { unique: false });
    }
  };

  request.onsuccess = (e) => {
    db = e.target.result;
    console.log('✅ База данных успешно открыта');
    renderAll();
  };

  request.onerror = (e) => console.error('❌ Ошибка БД:', e.target.error);
}

// Сохранение (только добавление новой цитаты)
function saveQuoteData(text, title, author) {
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
      
      // Если книги нет — создаем, если есть — обновляем автора (на всякий случай)
      if (!bookRecord) {
        bookRecord = { title, author };
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      } else if (bookRecord.author !== author) {
        bookRecord.author = author;
        const putBookReq = booksStore.put(bookRecord);
        putBookReq.onerror = reject;
      }
      
      // Добавляем цитату (без ID, автоинкремент сам присвоит номер)
      const quoteData = { text, bookTitle: title };
      const addQuoteReq = quotesStore.add(quoteData);
      
      addQuoteReq.onsuccess = resolve;
      addQuoteReq.onerror = reject;
    };
    
    getBookReq.onerror = reject;
  });
}

function getBooks(cb) {
  if (!db) return cb(); 
  const tx = db.transaction('books', 'readonly');
  const store = tx.objectStore('books');
  const req = store.getAll();
  req.onsuccess = () => cb(req.result);
  req.onerror = (e) => { console.error(e); cb(); };
}

function getQuotes(filterTitle, cb) {
  if (!db) return cb(); 
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

function renderAll(filterTitle = '') {
  getBooks(books => {
    booksCache = books;

    if (filterEl) {
      filterEl.innerHTML = '<option value="">Все произведения</option>';
      books.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.title;
        opt.textContent = `${b.title} (${b.author})`;
        filterEl.appendChild(opt);
      });
    }

    getQuotes(filterTitle, quotes => {
      const listEl = document.getElementById('quotes-list');
      if (!listEl) return;
      
      listEl.innerHTML = '';

      const authorMap = {};
      books.forEach(b => authorMap[b.title] = b.author);

      // Перемешивание (Shuffle)
      for (let i = quotes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [quotes[i], quotes[j]] = [quotes[j], quotes[i]];
      }

      quotes.forEach(q => {
        const li = document.createElement('li');
        li.className = 'quote-card';
        const author = authorMap[q.bookTitle] || 'Неизвестен';

        // ✅ УБРАНА кнопка редактирования. Только текст и книга.
        li.innerHTML = `
          <div class="quote-content">
            <p class="quote-text">\${escapeHtml(q.text)}</p>
            <div class="book-info">${q.bookTitle} — ${author}</div>
          </div>
        `;

        listEl.appendChild(li);
      });
    });
  });
}

// --- Логика модального окна (Добавить) ---
if (addBtn) {
  addBtn.addEventListener('click', (e) => {
    e.preventDefault();
    quoteTextInput.value = '';
    bookTitleInput.value = '';
    authorNameInput.value = '';
    if (modalEl) modalEl.classList.remove('hidden');
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    if (modalEl) modalEl.classList.add('hidden');
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

    try {
      // ✅ Передаем только данные, ID не нужен
      await saveQuoteData(text, title, author);
      
      if (modalEl) modalEl.classList.add('hidden');
      formEl.reset();
      
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
