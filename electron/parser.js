const fs = require('fs').promises
const path = require('path')
const EPub = require('epub2').EPub
const jschardet = require('jschardet')
const iconv = require('iconv-lite')
const Mobi = require('mobi')

// Constants from Legado logic
const MAX_LENGTH_WITH_NO_TOC = 10 * 1024 // 10KB
const MAX_LENGTH_WITH_TOC = 102400 // 100KB

// Common TOC Regex patterns
const TOC_RULES = [
  { pattern: "^\\s*[第卷][0-9一二三四五六七八九十百千万]+[章卷].*$", enable: true },
  { pattern: "^\\s*(Chapter|CHAPTER)\\s*\\d+.*$", enable: true },
  { pattern: "^\\s*第\\s*[0-9]+\\s*章.*$", enable: true },
  { pattern: "^\\s*第\\s*[0-9]+\\s*节.*$", enable: true },
  { pattern: "^\\s*Book\\s*\\d+.*$", enable: true },
  { pattern: "^\\s*Part\\s*\\d+.*$", enable: true }
]

async function parseBook(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  
  if (ext === '.txt') {
    return await parseTxt(filePath)
  } else if (ext === '.epub') {
    return await parseEpub(filePath)
  } else if (ext === '.mobi') {
    return await parseMobi(filePath)
  }
  throw new Error('Unsupported format')
}

async function parseTxt(filePath) {
  const buffer = await fs.readFile(filePath)
  const detected = jschardet.detect(buffer)
  let content = ''
  
  if (detected.encoding) {
    content = iconv.decode(buffer, detected.encoding)
  } else {
    content = buffer.toString('utf8')
  }
  
  return parseContent(content, path.basename(filePath, '.txt'))
}

async function parseMobi(filePath) {
  const mobi = new Mobi(filePath)
  let content = mobi.content
  
  // Convert HTML-like content to Text
  content = content
      .replace(/<\/?(p|div|br|h\d)[^>]*>/gi, '\n') // Block elements to newline
      .replace(/<[^>]+>/g, '') // Strip other tags
  
  return parseContent(content, path.basename(filePath, '.mobi'))
}

function parseContent(content, title) {
  // Pre-processing: unify newlines
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  let chapters = []
  const pattern = getTocRule(content)
  
  if (pattern) {
    chapters = analyzeWithRule(content, pattern)
  } else {
    chapters = analyzeNoRule(content)
  }
  
  // Post-processing: Format content to HTML paragraphs for the reader
  const formattedChapters = chapters
    .filter(chap => {
      const rawContent = content.substring(chap.start, chap.end)
      // Filter out chapters with less than 30 characters (likely directory/volume headers)
      return rawContent.trim().length >= 30
    })
    .map(chap => {
    return {
      title: chap.title,
      content: formatChapterContent(content.substring(chap.start, chap.end))
    }
  })

  return {
    title: title,
    author: 'Unknown',
    chapters: formattedChapters
  }
}

/**
 * Get the best matching TOC rule
 */
function getTocRule(content) {
  // Sample first 512KB for rule detection (matches Legado bufferSize)
  const sample = content.slice(0, 512000)
  let maxCs = 1
  let bestPattern = null
  
  for (const rule of TOC_RULES) {
    if (!rule.enable) continue
    const regex = new RegExp(rule.pattern, 'gm')
    // Count matches
    const matches = sample.match(regex)
    if (matches && matches.length >= maxCs) {
      maxCs = matches.length
      bestPattern = regex
    }
  }
  return bestPattern
}

/**
 * Analyze content with a regex rule
 */
function analyzeWithRule(content, regex) {
  const toc = []
  let match
  // Reset lastIndex just in case
  regex.lastIndex = 0
  
  let lastStart = 0
  let isPreface = true
  
  while ((match = regex.exec(content)) !== null) {
    const chapterStart = match.index
    const chapterTitle = match[0].trim()
    
    if (isPreface && chapterStart > 0) {
        // Handle Preface/Introduction
        const prefaceContent = content.substring(0, chapterStart).trim()
        if (prefaceContent.length > 0) {
             toc.push({
                 title: "前言",
                 start: 0,
                 end: chapterStart
             })
        }
        isPreface = false
    }
    
    if (toc.length > 0) {
        // Close previous chapter
        toc[toc.length - 1].end = chapterStart
    }
    
    // Create new chapter
    toc.push({
        title: chapterTitle,
        start: chapterStart,
        end: content.length // Will be updated by next iteration or loop end
    })
    
    // Check for large chapters and split if necessary
    // Note: We check the *previous* chapter here in the loop or after the loop?
    // Legado logic does it inside the loop (check offset difference).
    // Here we have the full string. We can check the previous chapter's length now.
    
    const lastChapter = toc.length > 1 ? toc[toc.length - 2] : (toc.length === 1 && !isPreface ? null : toc[0]) // Wait, simplify logic
    
    // Actually, let's just run a pass after collecting all ranges or check current gap.
    lastStart = chapterStart
  }
  
  // Handle the very last chapter's actual content
  // The loop sets 'end' to content.length by default for the new chapter.
  
  // Now process splits for large chapters
  // We do this by iterating the generated TOC and expanding it.
  const finalToc = []
  
  for (const chapter of toc) {
      const len = chapter.end - chapter.start
      if (len > MAX_LENGTH_WITH_TOC) {
          const splits = splitChapter(content, chapter.start, chapter.end, chapter.title, MAX_LENGTH_WITH_TOC)
          finalToc.push(...splits)
      } else {
          finalToc.push(chapter)
      }
  }
  
  return finalToc
}

/**
 * Analyze content without rules (fixed size split)
 */
function analyzeNoRule(content) {
  return splitChapter(content, 0, content.length, "第", MAX_LENGTH_WITH_NO_TOC, true)
}

/**
 * Split a range into sub-chapters based on max length
 */
function splitChapter(content, start, end, baseTitle, maxLength, autoNumber = false) {
  const chapters = []
  let currentPos = start
  let partIndex = 1
  
  while (currentPos < end) {
      let chunkEnd = currentPos + maxLength
      if (chunkEnd >= end) {
          chunkEnd = end
      } else {
          // Try to find a newline to break cleanly
          const nextNewline = content.indexOf('\n', chunkEnd)
          if (nextNewline !== -1 && nextNewline - chunkEnd < 1000) { // tolerance
             chunkEnd = nextNewline
          } else {
             // Search backwards for a newline
             const prevNewline = content.lastIndexOf('\n', chunkEnd)
             if (prevNewline > currentPos) {
                 chunkEnd = prevNewline
             }
          }
      }
      
      const title = autoNumber ? `${baseTitle}${chapters.length + 1}章` : `${baseTitle} (${partIndex})`
      
      chapters.push({
          title: title,
          start: currentPos,
          end: chunkEnd
      })
      
      currentPos = chunkEnd
      partIndex++
  }
  return chapters
}

/**
 * Format text to HTML paragraphs
 */
function formatChapterContent(text) {
  const lines = text.split('\n')
  return lines
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map(l => `<p>　　${l}</p>`)
    .join('')
}


async function parseEpub(filePath) {
  return new Promise((resolve, reject) => {
    EPub.createAsync(filePath, null, null).then(async (epub) => {
      const chapters = []
      // epub2 gives us flow. we need to read chapters.
      // This is simplified.
      
      // Attempt to get metadata
      const metadata = epub.metadata
      
      // Iterate flow to get chapters
      // Note: getting text from epub chapters in node is not always straightforward
      // We might just store the path and let renderer handle it, 
      // BUT the requirement says "store in postgres".
      
      // For this demo, we will extract text if possible.
      // epub2 has `getText(id)`
      
      const flow = epub.flow
      for (const chapter of flow) {
         let text = await epub.getChapterRawAsync(chapter.id)
         // Process images to convert relative paths to base64
         text = await processChapterImages(epub, chapter.id, text);
         
         chapters.push({
            title: chapter.title || chapter.id,
            content: text
         })
      }
      
      resolve({
        title: metadata.title || path.basename(filePath, '.epub'),
        author: metadata.creator,
        cover: null, // Extracting cover is another step
        chapters
      })
    }).catch(reject)
  })
}

async function processChapterImages(epub, chapterId, content) {
  if (!content) return content;
  
  const chapterItem = epub.manifest[chapterId];
  if (!chapterItem || !chapterItem.href) return content;
  
  const chapterDir = path.posix.dirname(chapterItem.href);
  // Regex to find img tags with src attribute
  // Captures: 1=quote, 2=path
  const imgRegex = /<img[^>]+src=(["'])([^"']+)\1[^>]*>/gi;
  
  let match;
  const replacements = [];
  
  while ((match = imgRegex.exec(content)) !== null) {
    const imgTag = match[0];
    const quote = match[1];
    let src = match[2];
    
    if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('//')) continue;
    
    // Remove query/hash
    const cleanSrc = src.split('?')[0].split('#')[0];
    
    // Resolve path
    const absolutePath = path.posix.join(chapterDir, cleanSrc);
    
    // Find in manifest
    const imageId = Object.keys(epub.manifest).find(id => epub.manifest[id].href === absolutePath);
    
    if (imageId) {
      try {
        const buffer = await getEpubImage(epub, imageId);
        if (buffer) {
          const mimeType = epub.manifest[imageId]['media-type'] || 'image/jpeg';
          const base64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
          
          // Replace the src attribute in the tag
          // We construct the search string: src="path"
          const searchStr = `src=${quote}${src}${quote}`;
          const replaceStr = `src=${quote}${base64}${quote}`;
          
          // We only replace the first occurrence in the tag string, which should be correct for the src attribute
          const newTag = imgTag.replace(searchStr, replaceStr);
          
          replacements.push({
            start: match.index,
            end: match.index + imgTag.length,
            newTag
          });
        }
      } catch (err) {
        console.error(`Failed to load image ${cleanSrc}:`, err);
      }
    }
  }
  
  // Apply replacements in reverse order
  replacements.sort((a, b) => b.start - a.start);
  for (const r of replacements) {
    content = content.substring(0, r.start) + r.newTag + content.substring(r.end);
  }
  
  return content;
}

function getEpubImage(epub, id) {
  return new Promise((resolve, reject) => {
    epub.getImage(id, (err, data, mimeType) => {
      if (err) {
        // Don't fail the whole parse for a missing image
        console.warn(`Image not found: ${id}`, err);
        resolve(null);
      } else {
        resolve(data);
      }
    });
  });
}

module.exports = { parseBook }
