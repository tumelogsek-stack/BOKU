# Multi-Device Synchronization Architecture Plan

To move from a local-only (IndexedDB) app to a cross-device synced application, we need to introduce a "Backend-as-a-Service" (BaaS) or a custom backend.

Here is the step-by-step roadmap to implement this using the existing Next.js stack.

## 1. Authentication (Identity)
We need to know *who* is reading so we can sync *their* specific data.
*   **Recommendation**: **Clerk** or **NextAuth.js (Auth.js)**.
*   **Implementation**:
    *   Install auth library.
    *   Wrap the app in an Auth Provider.
    *   Add Sign In / Sign Up pages.
    *   **Result**: We get a `userId` to tag data with.

## 2. Cloud Database (Metadata & Progress)
We need a centralized place to store:
*   Which books a user has.
*   Their current reading position (CFI).
*   Bookmarks/Highlights.

*   **Recommendation**: **Supabase** (Postgres) or **Firebase** (NoSQL).
*   **Schema (SQL Example)**:
    ```sql
    table users {
      id: uuid primary key
      email: text
    }
    
    table books {
      id: uuid primary key
      user_id: uuid references users(id)
      title: text
      author: text
      file_url: text  -- URL to the ebook file in storage
      added_at: timestamp
    }
    
    table progress {
      user_id: uuid
      book_id: uuid
      cfi: text       -- The reading position
      updated_at: timestamp
      primary key (user_id, book_id)
    }
    ```

## 3. File Storage (The .epub files)
IndexedDB can store files locally, but to sync them, we need cloud object storage. Storing files in a SQL database is inefficient.
*   **Recommendation**: **Supabase Storage**, **AWS S3**, or **Vercel Blob**.
*   **Flow**:
    1.  User opens a book.
    2.  App checks if it exists in Cloud Storage.
    3.  If not, upload it -> get a URL -> save URL to Database.
    4.  On Device B: App sees the book in Database, downloads from URL, saves to local IndexedDB.

## 4. Synchronization Logic (The "Sync Engine")
We need to keep IndexedDB (local) and the Cloud DB in sync.

### Strategy: "Offline-First with Cloud Sync"
1.  **On Load**:
    *   Fetch latest `progress` from Cloud DB.
    *   Compare with local `progress`.
    *   **Rule**: "Last Write Wins" (The timestamp that is newer is the correct one).
    *   Update local IndexedDB if Cloud is newer.

2.  **On Read (Page Turn)**:
    *   Update local IndexedDB (fast, instant).
    *   Debounce (wait 2-5 seconds) -> Send `PUT` request to API to update Cloud DB.

3.  **On New Book**:
    *   Save to local IndexedDB.
    *   Background upload file to Storage + Metadata to DB.

## 5. Implementation Steps (Draft)

### Phase 1: Auth & Progress Sync (Easier)
*   User signs in.
*   User opens a book *that they already have on the device*.
*   We sync only the `cfi` (position) string via an API.
*   *Limitation*: User must manually add the same EPUB file to both devices.

### Phase 2: Full Asset Sync (Harder)
*   User uploads EPUB on Device A.
*   Device A uploads file to Cloud Storage.
*   Device B sees book in list (greyed out).
*   User clicks download on Device B.
*   Device B fetches from Cloud Storage -> saves to IndexedDB.

## Recommended Tech Stack for this Project
Since you are using **Next.js**:
1.  **Auth**: Clerk (easiest setup).
2.  **DB & Storage**: Supabase (gives you Postgres + File Storage + Realtime subscriptions).
3.  **State Management**: TanStack Query (React Query) to handle the fetching/caching/syncing logic.
