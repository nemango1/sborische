const DB_NAME = 'QuotesDB';
const DB_VERSION = 2;
let db;
let booksCache = []; // кэш книг для быстрого поиска автора

// --- Элементы DOM (объявляем заранее, но используем после проверки) ---
const modalEl = document.getElementById('modal');
const addBtn = document.getElementById('add-btn');
const closeBtn = document.getElementById('close-modal');
const formEl = document.getElementById('add-quote-form');
const quoteTextInput = document.getElementById('quote-text');
const bookTitleInput = document.getElementById('book-title');
const authorNameInput = document.getElementById('author-name');
const filterEl = document.getElementById('book-filter');
const manageBooksBtn = document.getElementById('manage-books-btn');
const booksModalEl = document.getElementById('books-modal');
const closeBooksModalBtn = document.getElementById('close-books-modal');
const booksManageListEl = document.getElementById('books-manage-list');
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
    console.log('База данных успешно открыта');
    
    renderAll();
    
  };

  request.onerror = (e) => console.error('Ошибка БД:', e.target.error);
}

function deleteQuote(quoteId) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('База данных не инициализирована'));
      return;
    }
    const tx = db.transaction('quotes', 'readwrite');
    const store = tx.objectStore('quotes');
    const req = store.delete(quoteId);
    req.onsuccess = () => resolve();
    req.onerror = (e) => reject(e.target.error);
  });
}
function deleteBookWithQuotes(title) {
  return new Promise((resolve, reject) => {
    if (!db) {
      reject(new Error('База данных не инициализирована'));
      return;
    }
    const tx = db.transaction(['books', 'quotes'], 'readwrite');
    const booksStore = tx.objectStore('books');
    const quotesStore = tx.objectStore('quotes');
    const index = quotesStore.index('bookTitle');

    // 1) удаляем книгу
    const delBookReq = booksStore.delete(title);
    delBookReq.onerror = (e) => reject(e.target.error);

    // 2) удаляем все цитаты этой книги через индекс
    const cursorReq = index.openKeyCursor(IDBKeyRange.only(title));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        quotesStore.delete(cursor.primaryKey);
        cursor.continue();
      }
    };
    cursorReq.onerror = (e) => reject(e.target.error);

    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}
function renderBooksManageList() {
  if (!booksManageListEl) return;

  getBooks(books => {
    booksManageListEl.innerHTML = '';

    if (!books.length) {
      const li = document.createElement('li');
      li.className = 'books-manage-empty';
      li.textContent = 'Пока нет ни одного произведения.';
      booksManageListEl.appendChild(li);
      return;
    }

    // сортируем по названию для удобства
    const sorted = [...books].sort((a, b) =>
      a.title.localeCompare(b.title, 'ru')
    );

    sorted.forEach(b => {
      const li = document.createElement('li');
      li.className = 'books-manage-item';
      li.innerHTML = `
        <div class="books-manage-info">
          <span class="books-manage-title">${escapeHtml(b.title)}</span>
          <span class="books-manage-author">${escapeHtml(b.author || 'Неизвестен')}</span>
        </div>
        <button type="button" class="books-manage-del" title="Удалить произведение">×</button>
      `;

      const delBtn = li.querySelector('.books-manage-del');
      delBtn.addEventListener('click', async () => {
        const ok = confirm(
          `Удалить произведение «${b.title}» и ВСЕ его цитаты?`
        );
        if (!ok) return;

        try {
          await deleteBookWithQuotes(b.title);
          renderBooksManageList();   // обновить список в модалке
          renderAll(filterEl ? filterEl.value : ''); // обновить карточки и фильтр
        } catch (err) {
          console.error(err);
          alert('Не удалось удалить: ' + err.message);
        }
      });

      booksManageListEl.appendChild(li);
    });
  });
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
  if (!db) return cb([]);
  const tx = db.transaction('quotes', 'readonly');
  const store = tx.objectStore('quotes');
  const req = store.openCursor();
  const list = [];
  req.onsuccess = (e) => {
    const cursor = e.target.result;
    if (cursor) {
      // приклеиваем ключ к объекту
      list.push({ ...cursor.value, id: cursor.key });
      cursor.continue();
    } else {
      let filtered = list;
      if (filterTitle) {
        filtered = list.filter(q => q.bookTitle === filterTitle);
      }
      cb(filtered);
    }
  };
  req.onerror = (e) => { console.error(e); cb([]); };
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

        // ✅ ВАЖНО: никаких \ перед $
        li.innerHTML = `
          <div class="quote-content">
            <p class="quote-text">${escapeHtml(q.text)}</p>
            <div class="book-info">${q.bookTitle} — ${author}</div>
          </div>
          
        `;
        li.innerHTML = `
  <button class="delete-btn" title="Удалить цитату" aria-label="Удалить цитату">×</button>
  <div class="quote-content">
    <p class="quote-text">${escapeHtml(q.text)}</p>
    <div class="book-info">${escapeHtml(q.bookTitle)} — ${escapeHtml(author)}</div>
  </div>
`;

        listEl.appendChild(li);
        const delBtn = li.querySelector('.delete-btn');
if (delBtn) {
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Удалить эту цитату?')) return;
    try {
      await deleteQuote(q.id);
      renderAll(filterTitle); // перерисовываем с текущим фильтром
    } catch (err) {
      console.error(err);
      alert('Не удалось удалить: ' + err.message);
    }
  });
}
      });




    });
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
if (manageBooksBtn) {
  manageBooksBtn.addEventListener('click', () => {
    renderBooksManageList();
    if (booksModalEl) booksModalEl.classList.remove('hidden');
  });
}

if (closeBooksModalBtn) {
  closeBooksModalBtn.addEventListener('click', () => {
    if (booksModalEl) booksModalEl.classList.add('hidden');
  });
}

// закрытие по клику на фон (по желанию)
if (booksModalEl) {
  booksModalEl.addEventListener('click', (e) => {
    if (e.target === booksModalEl) booksModalEl.classList.add('hidden');
  });
}
// --- Логика экрана приветствия ---
const splashScreen = document.getElementById('splash-screen');
const splashBtn = document.getElementById('splash-btn');

if (splashScreen && splashBtn) {
  // Добавляем класс ready, чтобы подготовить основной контент (он станет видимым после клика)
  // Но он всё еще перекрыт заставкой, поэтому не виден.
  
  splashBtn.addEventListener('click', () => {
    // Плавно скрываем заставку
    splashScreen.classList.add('hidden');
    
    // Через 800мс (длительность анимации исчезновения) полностью удаляем её из DOM,
    // чтобы она не мешала кликам, и показываем контент.
    setTimeout(() => {
      splashScreen.remove();
      document.body.classList.add('ready');
    }, 800); 
  });
}
initDB();