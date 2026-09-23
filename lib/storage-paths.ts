// Object layout in the private `books` storage bucket. Every read/write of a
// book's files must build its path here.
//
// Must match supabase/migrations/0001_init.sql:
//   * books_insert_own requires file_path = '{user_id}/{book_id}/book.epub'
//   * storage policies require the first folder to be the user's id

export const BOOKS_BUCKET = "books";

const bookFolder = (userId: string, bookId: string) => `${userId}/${bookId}`;

export const epubPath = (userId: string, bookId: string) =>
  `${bookFolder(userId, bookId)}/book.epub`;

export const coverPath = (userId: string, bookId: string, ext: string) =>
  `${bookFolder(userId, bookId)}/cover.${ext.replace(/^\./, "")}`;

export const locationsPath = (userId: string, bookId: string) =>
  `${bookFolder(userId, bookId)}/locations.json`;
