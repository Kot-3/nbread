const sqlite3 = require('sqlite3').verbose()
const path = require('path')

let db

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err)
      else resolve(this)
    })
  })
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, result) => {
      if (err) reject(err)
      else resolve(result)
    })
  })
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

async function initDB(dbPath) {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(dbPath, async (err) => {
      if (err) {
        console.error('Could not connect to database', err)
        reject(err)
        return
      }
      console.log('Connected to SQLite database')
      
      try {
        // Enable foreign keys
        await new Promise((res, rej) => {
            db.run('PRAGMA foreign_keys = ON', (err) => {
                if (err) rej(err); else res();
            });
        });

        await run(`
          CREATE TABLE IF NOT EXISTS books (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            author TEXT,
            path TEXT,
            cover TEXT,
            format TEXT,
            added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_read_at DATETIME,
            progress INTEGER DEFAULT 0,
            chapter_index INTEGER DEFAULT 0,
            scroll_top INTEGER DEFAULT 0,
            total_chapters INTEGER DEFAULT 0
          )
        `)
        
        await run(`
          CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            book_id INTEGER,
            title TEXT,
            content TEXT,
            order_index INTEGER,
            FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
          )
        `)

        // Migration: Check for missing columns in books table
        const tableInfo = await all('PRAGMA table_info(books)')
        const columns = tableInfo.map(c => c.name)
        
        if (!columns.includes('chapter_index')) {
            await run('ALTER TABLE books ADD COLUMN chapter_index INTEGER DEFAULT 0')
        }
        if (!columns.includes('scroll_top')) {
            await run('ALTER TABLE books ADD COLUMN scroll_top INTEGER DEFAULT 0')
        }

        resolve(true)
      } catch (error) {
        reject(error)
      }
    })
  })
}

async function saveBook(bookMetadata, chapters) {
  try {
    await run('BEGIN TRANSACTION')
    
    const result = await run(
      'INSERT INTO books (title, author, path, cover, format, total_chapters) VALUES (?, ?, ?, ?, ?, ?)',
      [bookMetadata.title, bookMetadata.author, bookMetadata.path, bookMetadata.cover, bookMetadata.format, chapters.length]
    )
    const bookId = result.lastID
    
    // Prepare statement for chapters for better performance
    const stmt = db.prepare('INSERT INTO chapters (book_id, title, content, order_index) VALUES (?, ?, ?, ?)')
    
    const insertChapter = (chapter, index) => {
      return new Promise((resolve, reject) => {
        stmt.run([bookId, chapter.title, chapter.content, index], (err) => {
          if (err) reject(err)
          else resolve()
        })
      })
    }
    
    for (let i = 0; i < chapters.length; i++) {
      await insertChapter(chapters[i], i)
    }
    
    stmt.finalize()
    await run('COMMIT')
    return bookId
  } catch (e) {
    await run('ROLLBACK')
    throw e
  }
}

async function getBooks() {
  return await all('SELECT * FROM books ORDER BY last_read_at DESC, added_at DESC')
}

async function getBookContent(bookId) {
  const book = await get('SELECT * FROM books WHERE id = ?', [bookId])
  if (!book) return null
  
  const chapters = await all('SELECT * FROM chapters WHERE book_id = ? ORDER BY order_index ASC', [bookId])
  
  return {
    ...book,
    chapters
  }
}

async function saveProgress(bookId, chapterIndex, scrollTop, progress) {
  await run(
    'UPDATE books SET chapter_index = ?, scroll_top = ?, progress = ?, last_read_at = CURRENT_TIMESTAMP WHERE id = ?', 
    [chapterIndex, scrollTop, progress, bookId]
  )
}

async function deleteBook(bookId) {
  await run('DELETE FROM books WHERE id = ?', [bookId])
  return true
}

async function deleteBooks(bookIds) {
  try {
    await run('BEGIN TRANSACTION')
    for (const id of bookIds) {
        await deleteBook(id)
    }
    await run('COMMIT')
    return true
  } catch (e) {
    await run('ROLLBACK')
    throw e
  }
}

module.exports = {
  initDB,
  saveBook,
  getBooks,
  getBookContent,
  saveProgress,
  deleteBook,
  deleteBooks
}
