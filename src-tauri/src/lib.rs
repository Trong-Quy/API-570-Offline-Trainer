mod db;
mod questions2;

use db::*;
use rusqlite::{self, params};
use serde_json;
use tauri::AppHandle;

#[tauri::command]
fn init_database(app: AppHandle) -> Result<String, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute_batch("
        PRAGMA journal_mode=WAL;
        PRAGMA foreign_keys=ON;

        CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source_document TEXT NOT NULL DEFAULT 'API 570',
            clause TEXT,
            topic TEXT NOT NULL,
            difficulty INTEGER NOT NULL DEFAULT 2,
            question_text TEXT NOT NULL,
            option_a TEXT NOT NULL,
            option_b TEXT NOT NULL,
            option_c TEXT NOT NULL,
            option_d TEXT NOT NULL,
            correct_answer TEXT NOT NULL,
            explanation TEXT NOT NULL DEFAULT '',
            ai_explanation TEXT,
            tags TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS flashcards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL,
            front TEXT NOT NULL,
            back TEXT NOT NULL,
            ease_factor REAL DEFAULT 2.5,
            interval INTEGER DEFAULT 1,
            repetitions INTEGER DEFAULT 0,
            next_review TEXT DEFAULT (date('now')),
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS bookmarks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pdf_name TEXT NOT NULL,
            pdf_path TEXT NOT NULL,
            page INTEGER NOT NULL,
            note TEXT,
            highlight_text TEXT,
            color TEXT DEFAULT '#FFD700',
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS exam_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mode TEXT NOT NULL,
            score INTEGER NOT NULL DEFAULT 0,
            total_questions INTEGER NOT NULL,
            duration_seconds INTEGER NOT NULL DEFAULT 0,
            weak_topics TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS exam_answers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            question_id INTEGER NOT NULL,
            selected_answer TEXT NOT NULL,
            is_correct INTEGER NOT NULL DEFAULT 0,
            time_taken_seconds INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS topic_progress (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT NOT NULL UNIQUE,
            correct INTEGER DEFAULT 0,
            total INTEGER DEFAULT 0,
            last_seen TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS pdfs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            path TEXT NOT NULL UNIQUE,
            last_page INTEGER DEFAULT 1,
            added_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS user_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic TEXT,
            pdf_name TEXT,
            page INTEGER,
            content TEXT NOT NULL,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS calc_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            calc_id TEXT NOT NULL,
            inputs TEXT NOT NULL,
            result REAL NOT NULL,
            is_correct INTEGER DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now'))
        );
    ").map_err(|e| e.to_string())?;
    Ok("Database initialized".to_string())
}

#[tauri::command]
fn get_questions(app: AppHandle, filter: QuestionFilter) -> Result<Vec<Question>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    query_questions(&conn, &filter).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_exam_session(
    app: AppHandle,
    mode: String,
    score: i32,
    total: i32,
    duration: i32,
    answers: Vec<ExamAnswer>,
    weak_topics: String,
) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO exam_sessions (mode, score, total_questions, duration_seconds, weak_topics) VALUES (?1,?2,?3,?4,?5)",
        params![mode, score, total, duration, weak_topics],
    ).map_err(|e| e.to_string())?;
    let session_id = conn.last_insert_rowid();

    for answer in &answers {
        conn.execute(
            "INSERT INTO exam_answers (session_id, question_id, selected_answer, is_correct, time_taken_seconds) VALUES (?1,?2,?3,?4,?5)",
            params![session_id, answer.question_id, answer.selected_answer, answer.is_correct as i32, answer.time_taken_seconds],
        ).map_err(|e| e.to_string())?;

        conn.execute(
            "INSERT INTO topic_progress (topic, correct, total)
             SELECT topic, 0, 1 FROM questions WHERE id = ?1
             ON CONFLICT(topic) DO UPDATE SET total = total + 1, last_seen = datetime('now')",
            params![answer.question_id],
        ).ok();

        if answer.is_correct {
            conn.execute(
                "UPDATE topic_progress SET correct = correct + 1 WHERE topic = (SELECT topic FROM questions WHERE id = ?1)",
                params![answer.question_id],
            ).ok();
        }
    }
    Ok(session_id)
}

#[tauri::command]
fn get_user_stats(app: AppHandle) -> Result<UserStats, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;

    let (total, correct): (i32, i32) = conn.query_row(
        "SELECT COALESCE(SUM(total_questions),0), COALESCE(SUM(score),0) FROM exam_sessions",
        [], |r| Ok((r.get(0)?, r.get(1)?)),
    ).unwrap_or((0, 0));

    let total_exams: i32 = conn.query_row(
        "SELECT COUNT(*) FROM exam_sessions", [], |r| r.get(0)
    ).unwrap_or(0);

    let avg_score = if total > 0 { (correct as f64 / total as f64) * 100.0 } else { 0.0 };

    let mut stmt = conn.prepare(
        "SELECT topic, correct, total, CAST(correct AS REAL)/NULLIF(total,0) FROM topic_progress ORDER BY CAST(correct AS REAL)/NULLIF(total,0) ASC LIMIT 5"
    ).map_err(|e| e.to_string())?;

    let weak_topics: Vec<TopicStat> = stmt.query_map([], |row| {
        Ok(TopicStat { topic: row.get(0)?, correct: row.get(1)?, total: row.get(2)?, accuracy: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0) })
    }).map_err(|e| e.to_string())?.flatten().collect();

    let mut stmt2 = conn.prepare(
        "SELECT topic, correct, total, CAST(correct AS REAL)/NULLIF(total,0) FROM topic_progress ORDER BY CAST(correct AS REAL)/NULLIF(total,0) DESC LIMIT 5"
    ).map_err(|e| e.to_string())?;

    let strong_topics: Vec<TopicStat> = stmt2.query_map([], |row| {
        Ok(TopicStat { topic: row.get(0)?, correct: row.get(1)?, total: row.get(2)?, accuracy: row.get::<_, Option<f64>>(3)?.unwrap_or(0.0) })
    }).map_err(|e| e.to_string())?.flatten().collect();

    Ok(UserStats { total_questions_answered: total, total_correct: correct, total_exams, avg_score, weak_topics, strong_topics, streak_days: 0 })
}

#[tauri::command]
fn add_bookmark(
    app: AppHandle,
    pdf_name: String,
    pdf_path: String,
    page: i32,
    note: Option<String>,
    highlight_text: Option<String>,
    color: Option<String>,
) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO bookmarks (pdf_name, pdf_path, page, note, highlight_text, color) VALUES (?1,?2,?3,?4,?5,?6)",
        params![pdf_name, pdf_path, page, note, highlight_text, color.unwrap_or("#FFD700".to_string())],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn get_bookmarks(app: AppHandle) -> Result<Vec<Bookmark>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, pdf_name, pdf_path, page, note, highlight_text, color, created_at FROM bookmarks ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| Ok(Bookmark {
        id: row.get(0)?, pdf_name: row.get(1)?, pdf_path: row.get(2)?,
        page: row.get(3)?, note: row.get(4)?, highlight_text: row.get(5)?,
        color: row.get(6)?, created_at: row.get(7)?,
    })).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_bookmark(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM bookmarks WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_flashcards_due(app: AppHandle) -> Result<Vec<Flashcard>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, topic, front, back, ease_factor, interval, repetitions, next_review, created_at FROM flashcards WHERE next_review <= date('now') ORDER BY next_review ASC"
    ).map_err(|e| e.to_string())?;
    let cards = stmt.query_map([], |row| Ok(Flashcard {
        id: row.get(0)?, topic: row.get(1)?, front: row.get(2)?,
        back: row.get(3)?, ease_factor: row.get(4)?, interval: row.get(5)?,
        repetitions: row.get(6)?, next_review: row.get(7)?, created_at: row.get(8)?,
    })).map_err(|e| e.to_string())?;
    cards.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn review_flashcard(app: AppHandle, id: i64, quality: i32) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let (ef, interval, reps): (f64, i32, i32) = conn.query_row(
        "SELECT ease_factor, interval, repetitions FROM flashcards WHERE id=?1",
        params![id], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?))
    ).map_err(|e| e.to_string())?;
    let (new_ef, new_interval, new_reps) = sm2_algorithm(ef, interval, reps, quality);
    conn.execute(
        "UPDATE flashcards SET ease_factor=?1, interval=?2, repetitions=?3, next_review=date('now', ?4||' days') WHERE id=?5",
        params![new_ef, new_interval, new_reps, new_interval.to_string(), id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn search_questions(app: AppHandle, query: String) -> Result<Vec<Question>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let term = format!("%{}%", query.to_lowercase());
    let mut stmt = conn.prepare(
        "SELECT id, source_document, clause, topic, difficulty, question_text,
                option_a, option_b, option_c, option_d, correct_answer,
                explanation, ai_explanation, tags
         FROM questions WHERE LOWER(question_text) LIKE ?1 OR LOWER(topic) LIKE ?1 OR clause LIKE ?1 OR LOWER(tags) LIKE ?1 LIMIT 50"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map(params![term], |row| Ok(Question {
        id: row.get(0)?, source_document: row.get(1)?, clause: row.get(2)?,
        topic: row.get(3)?, difficulty: row.get(4)?, question_text: row.get(5)?,
        option_a: row.get(6)?, option_b: row.get(7)?, option_c: row.get(8)?,
        option_d: row.get(9)?, correct_answer: row.get(10)?, explanation: row.get(11)?,
        ai_explanation: row.get(12)?, tags: row.get(13)?,
    })).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_pdf(app: AppHandle, name: String, path: String) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT OR REPLACE INTO pdfs (name, path) VALUES (?1,?2)",
        params![name, path],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn get_pdfs(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, path, last_page, added_at FROM pdfs ORDER BY added_at DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "path": row.get::<_, String>(2)?,
            "lastPage": row.get::<_, i32>(3)?,
            "addedAt": row.get::<_, String>(4)?,
        }))
    }).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_pdf_last_page(app: AppHandle, pdf_id: i64, page: i32) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute("UPDATE pdfs SET last_page=?1 WHERE id=?2", params![page, pdf_id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_exam_history(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, mode, score, total_questions, duration_seconds, weak_topics, created_at FROM exam_sessions ORDER BY created_at DESC LIMIT 20"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| {
        let score: i32 = row.get(2)?;
        let total: i32 = row.get(3)?;
        let pct = if total > 0 { (score as f64 / total as f64 * 100.0).round() as i32 } else { 0 };
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "mode": row.get::<_, String>(1)?,
            "score": score, "totalQuestions": total, "percentage": pct,
            "durationSeconds": row.get::<_, i32>(4)?,
            "weakTopics": row.get::<_, Option<String>>(5)?,
            "createdAt": row.get::<_, String>(6)?,
        }))
    }).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn seed_questions(app: AppHandle) -> Result<String, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let count: i32 = conn.query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0)).unwrap_or(0);

    let mut questions: Vec<_> = get_seed_questions();
    questions.extend(questions2::get_extra_questions());

    let mut fc_count = 0i32;
    if count < questions.len() as i32 {
        for q in &questions {
            conn.execute(
                "INSERT OR IGNORE INTO questions (source_document, clause, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, tags) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
                params![q.0, q.1, q.2, q.3, q.4, q.5, q.6, q.7, q.8, q.9, q.10, q.11],
            ).ok();
        }
    }

    let fc_existing: i32 = conn.query_row("SELECT COUNT(*) FROM flashcards", [], |r| r.get(0)).unwrap_or(0);
    if fc_existing == 0 {
        let flashcards = get_seed_flashcards();
        fc_count = flashcards.len() as i32;
        for f in &flashcards {
            conn.execute("INSERT INTO flashcards (topic, front, back) VALUES (?1,?2,?3)", params![f.0, f.1, f.2]).ok();
        }
    }

    let final_count: i32 = conn.query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0)).unwrap_or(0);
    Ok(format!("Database has {} questions, {} flashcards", final_count, fc_existing + fc_count))
}

#[tauri::command]
fn get_analytics(app: AppHandle) -> Result<serde_json::Value, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;

    // Topic × difficulty heatmap
    let mut hm_stmt = conn.prepare(
        "SELECT q.topic, q.difficulty, COUNT(*) as total, SUM(CASE WHEN ea.is_correct=1 THEN 1 ELSE 0 END) as correct
         FROM exam_answers ea JOIN questions q ON ea.question_id = q.id
         GROUP BY q.topic, q.difficulty"
    ).map_err(|e| e.to_string())?;
    let heatmap: Vec<serde_json::Value> = hm_stmt.query_map([], |row| {
        let total: i32 = row.get(2)?;
        let correct: i32 = row.get::<_, Option<i32>>(3)?.unwrap_or(0);
        Ok(serde_json::json!({
            "topic": row.get::<_, String>(0)?,
            "difficulty": row.get::<_, i32>(1)?,
            "total": total,
            "correct": correct,
            "accuracy": if total > 0 { (correct as f64 / total as f64 * 100.0).round() as i32 } else { -1 },
        }))
    }).map_err(|e| e.to_string())?.flatten().collect();
    drop(hm_stmt);

    // Daily activity last 60 days
    let mut day_stmt = conn.prepare(
        "SELECT date(created_at) as day, COUNT(*) as exams, SUM(score) as correct, SUM(total_questions) as total
         FROM exam_sessions WHERE created_at >= date('now','-60 days')
         GROUP BY day ORDER BY day"
    ).map_err(|e| e.to_string())?;
    let daily: Vec<serde_json::Value> = day_stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "day": row.get::<_, String>(0)?,
            "exams": row.get::<_, i32>(1)?,
            "correct": row.get::<_, Option<i32>>(2)?.unwrap_or(0),
            "total": row.get::<_, Option<i32>>(3)?.unwrap_or(0),
        }))
    }).map_err(|e| e.to_string())?.flatten().collect();
    drop(day_stmt);

    // Streak: count consecutive days with exam activity ending today
    let mut streak_stmt = conn.prepare(
        "SELECT DISTINCT date(created_at) FROM exam_sessions ORDER BY date(created_at) DESC LIMIT 90"
    ).map_err(|e| e.to_string())?;
    let days: Vec<String> = streak_stmt.query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?.flatten().collect();
    drop(streak_stmt);

    let mut streak = 0i32;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let mut expected = today.clone();
    for day in &days {
        if day == &expected {
            streak += 1;
            // subtract one day from expected
            if let Ok(d) = chrono::NaiveDate::parse_from_str(&expected, "%Y-%m-%d") {
                expected = (d - chrono::Duration::days(1)).format("%Y-%m-%d").to_string();
            } else { break; }
        } else { break; }
    }

    // Performance by source document
    let mut src_stmt = conn.prepare(
        "SELECT q.source_document, COUNT(*) as total, SUM(ea.is_correct) as correct
         FROM exam_answers ea JOIN questions q ON ea.question_id=q.id
         GROUP BY q.source_document"
    ).map_err(|e| e.to_string())?;
    let by_source: Vec<serde_json::Value> = src_stmt.query_map([], |row| {
        let total: i32 = row.get(1)?;
        let correct: i32 = row.get::<_, Option<i32>>(2)?.unwrap_or(0);
        Ok(serde_json::json!({
            "source": row.get::<_, String>(0)?,
            "total": total,
            "correct": correct,
            "accuracy": if total > 0 { (correct as f64 / total as f64 * 100.0).round() as i32 } else { 0 },
        }))
    }).map_err(|e| e.to_string())?.flatten().collect();
    drop(src_stmt);

    // Performance by difficulty
    let mut diff_stmt = conn.prepare(
        "SELECT q.difficulty, COUNT(*) as total, SUM(ea.is_correct) as correct
         FROM exam_answers ea JOIN questions q ON ea.question_id=q.id
         GROUP BY q.difficulty ORDER BY q.difficulty"
    ).map_err(|e| e.to_string())?;
    let by_difficulty: Vec<serde_json::Value> = diff_stmt.query_map([], |row| {
        let total: i32 = row.get(1)?;
        let correct: i32 = row.get::<_, Option<i32>>(2)?.unwrap_or(0);
        Ok(serde_json::json!({
            "difficulty": row.get::<_, i32>(0)?,
            "total": total,
            "correct": correct,
            "accuracy": if total > 0 { (correct as f64 / total as f64 * 100.0).round() as i32 } else { 0 },
        }))
    }).map_err(|e| e.to_string())?.flatten().collect();

    let total_questions: i32 = conn.query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0)).unwrap_or(0);
    let total_flashcards: i32 = conn.query_row("SELECT COUNT(*) FROM flashcards", [], |r| r.get(0)).unwrap_or(0);
    let due_today: i32 = conn.query_row("SELECT COUNT(*) FROM flashcards WHERE next_review <= date('now')", [], |r| r.get(0)).unwrap_or(0);
    let total_notes: i32 = conn.query_row("SELECT COUNT(*) FROM user_notes", [], |r| r.get(0)).unwrap_or(0);

    Ok(serde_json::json!({
        "heatmap": heatmap,
        "daily": daily,
        "streak": streak,
        "bySource": by_source,
        "byDifficulty": by_difficulty,
        "totalQuestions": total_questions,
        "totalFlashcards": total_flashcards,
        "dueToday": due_today,
        "totalNotes": total_notes,
    }))
}

#[tauri::command]
fn insert_generated_question(
    app: AppHandle,
    source_document: String,
    clause: Option<String>,
    topic: String,
    difficulty: i32,
    question_text: String,
    option_a: String,
    option_b: String,
    option_c: String,
    option_d: String,
    correct_answer: String,
    explanation: String,
    tags: Option<String>,
) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO questions (source_document, clause, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, tags) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)",
        params![source_document, clause, topic, difficulty, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, tags],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn get_notes(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, topic, pdf_name, page, content, created_at, updated_at FROM user_notes ORDER BY updated_at DESC"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "topic": row.get::<_, Option<String>>(1)?,
            "pdf_name": row.get::<_, Option<String>>(2)?,
            "page": row.get::<_, Option<i32>>(3)?,
            "content": row.get::<_, String>(4)?,
            "created_at": row.get::<_, String>(5)?,
            "updated_at": row.get::<_, String>(6)?,
        }))
    }).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_note(app: AppHandle, topic: Option<String>, pdf_name: Option<String>, page: Option<i32>, content: String) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO user_notes (topic, pdf_name, page, content) VALUES (?1,?2,?3,?4)",
        params![topic, pdf_name, page, content],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn update_note(app: AppHandle, id: i64, content: String) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE user_notes SET content=?1, updated_at=datetime('now') WHERE id=?2",
        params![content, id],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_note(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM user_notes WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_all_flashcards(app: AppHandle, topic: Option<String>) -> Result<Vec<Flashcard>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let sql = if let Some(ref t) = topic {
        format!("SELECT id, topic, front, back, ease_factor, interval, repetitions, next_review, created_at FROM flashcards WHERE topic='{}' ORDER BY topic, id", t.replace('\'', "''"))
    } else {
        "SELECT id, topic, front, back, ease_factor, interval, repetitions, next_review, created_at FROM flashcards ORDER BY topic, id".to_string()
    };
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let cards = stmt.query_map([], |row| Ok(Flashcard {
        id: row.get(0)?, topic: row.get(1)?, front: row.get(2)?,
        back: row.get(3)?, ease_factor: row.get(4)?, interval: row.get(5)?,
        repetitions: row.get(6)?, next_review: row.get(7)?, created_at: row.get(8)?,
    })).map_err(|e| e.to_string())?;
    cards.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_flashcard(app: AppHandle, topic: String, front: String, back: String) -> Result<i64, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO flashcards (topic, front, back) VALUES (?1,?2,?3)",
        params![topic, front, back],
    ).map_err(|e| e.to_string())?;
    Ok(conn.last_insert_rowid())
}

#[tauri::command]
fn delete_flashcard(app: AppHandle, id: i64) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM flashcards WHERE id=?1", params![id]).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_weak_topic_questions(app: AppHandle, limit: i32) -> Result<Vec<Question>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let filter = QuestionFilter {
        topic: None,
        difficulty: None,
        source_document: None,
        limit: Some(limit),
        shuffle: Some(true),
        weak_topics: None,
    };

    // Try to get questions from recorded weak topics first
    let mut weak_stmt = conn.prepare(
        "SELECT topic FROM topic_progress WHERE total > 0 ORDER BY CAST(correct AS REAL)/NULLIF(total,0) ASC LIMIT 3"
    ).map_err(|e| e.to_string())?;
    let weak: Vec<String> = weak_stmt
        .query_map([], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .flatten()
        .collect();
    drop(weak_stmt);

    if weak.is_empty() {
        return query_questions(&conn, &filter).map_err(|e| e.to_string());
    }

    let placeholders: Vec<String> = weak.iter().enumerate().map(|(i, _)| format!("?{}", i + 1)).collect();
    let sql = format!(
        "SELECT id, source_document, clause, topic, difficulty, question_text,
                option_a, option_b, option_c, option_d, correct_answer,
                explanation, ai_explanation, tags
         FROM questions WHERE topic IN ({}) ORDER BY RANDOM() LIMIT {}",
        placeholders.join(","), limit
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let params_vec: Vec<&dyn rusqlite::ToSql> = weak.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let items = stmt.query_map(params_vec.as_slice(), |row| Ok(Question {
        id: row.get(0)?, source_document: row.get(1)?, clause: row.get(2)?,
        topic: row.get(3)?, difficulty: row.get(4)?, question_text: row.get(5)?,
        option_a: row.get(6)?, option_b: row.get(7)?, option_c: row.get(8)?,
        option_d: row.get(9)?, correct_answer: row.get(10)?, explanation: row.get(11)?,
        ai_explanation: row.get(12)?, tags: row.get(13)?,
    })).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_topic_list(app: AppHandle) -> Result<Vec<String>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare("SELECT DISTINCT topic FROM questions ORDER BY topic").map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |r| r.get(0)).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<String>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_calc_attempt(app: AppHandle, calc_id: String, inputs: String, result: f64, is_correct: bool) -> Result<(), String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO calc_history (calc_id, inputs, result, is_correct) VALUES (?1,?2,?3,?4)",
        params![calc_id, inputs, result, is_correct as i32],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_calc_stats(app: AppHandle) -> Result<Vec<serde_json::Value>, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT calc_id, COUNT(*) as total, SUM(is_correct) as correct FROM calc_history GROUP BY calc_id"
    ).map_err(|e| e.to_string())?;
    let items = stmt.query_map([], |row| {
        let total: i32 = row.get(1)?;
        let correct: i32 = row.get::<_, Option<i32>>(2)?.unwrap_or(0);
        Ok(serde_json::json!({
            "calcId": row.get::<_, String>(0)?,
            "total": total,
            "correct": correct,
            "accuracy": if total > 0 { (correct as f64 / total as f64 * 100.0).round() as i32 } else { 0 },
        }))
    }).map_err(|e| e.to_string())?;
    items.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_ai_question_count(app: AppHandle) -> Result<i32, String> {
    let conn = open_db(&app).map_err(|e| e.to_string())?;
    // Questions added after seeding are considered AI-generated
    let seed_count = get_seed_questions().len() as i32 + questions2::get_extra_questions().len() as i32;
    let total: i32 = conn.query_row("SELECT COUNT(*) FROM questions", [], |r| r.get(0)).unwrap_or(0);
    Ok((total - seed_count).max(0))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            init_database,
            get_questions,
            save_exam_session,
            get_user_stats,
            add_bookmark,
            get_bookmarks,
            delete_bookmark,
            get_flashcards_due,
            review_flashcard,
            search_questions,
            add_pdf,
            get_pdfs,
            update_pdf_last_page,
            get_exam_history,
            seed_questions,
            get_notes,
            add_note,
            update_note,
            delete_note,
            get_all_flashcards,
            add_flashcard,
            delete_flashcard,
            get_weak_topic_questions,
            get_topic_list,
            save_calc_attempt,
            get_calc_stats,
            get_analytics,
            insert_generated_question,
            get_ai_question_count,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
