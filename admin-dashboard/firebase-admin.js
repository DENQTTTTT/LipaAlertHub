// firebase-admin.js - Admin CLI for Forum Posts + Emergency Tips
// Run with Node.js

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, collection, query, where, orderBy, getDocs,
  addDoc, updateDoc, deleteDoc, doc
} = require('firebase/firestore');

// ========= Firebase Config =========
// Replace with your actual config
const firebaseConfig = {
  apiKey: "AIzaSyACw2laKXQGTW634IejVAdK8m0PKngvaRo",
  authDomain: "lipaalerthub.firebaseapp.com",
  projectId: "lipaalerthub",
  storageBucket: "lipaalerthub.firebasestorage.app",
  messagingSenderId: "991310233066",
  appId: "1:991310233066:web:7e836a60e5c4a302de0693",
  measurementId: "G-PCEYY3PFWW"
};


const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

  // ========= Colors =========
const colors = {
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m',
  white: '\x1b[37m', reset: '\x1b[0m'
};

// =====================================================
// ============== Forum Post Management ================
// =====================================================
async function getPendingPosts() {
  try {
    const q = query(
      collection(db, 'forumPosts'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));
  } catch (err) {
    console.error(colors.red, 'Error fetching posts:', err, colors.reset);
    return [];
  }
}

async function approvePost(postId, notes = '') {
  try {
    await updateDoc(doc(db, 'forumPosts', postId), {
      status: 'approved', adminNotes: notes, reviewedAt: new Date(),
    });
    console.log(`${colors.green}✅ Post approved!${colors.reset}`);
  } catch (err) {
    console.error(colors.red, 'Error approving post:', err, colors.reset);
  }
}

async function rejectPost(postId, notes = '') {
  try {
    await updateDoc(doc(db, 'forumPosts', postId), {
      status: 'rejected', adminNotes: notes, reviewedAt: new Date(),
    });
    console.log(`${colors.red}❌ Post rejected.${colors.reset}`);
  } catch (err) {
    console.error(colors.red, 'Error rejecting post:', err, colors.reset);
  }
}

function displayPost(post, index) {
  console.log(`\n${colors.cyan}========== POST #${index + 1} ==========${colors.reset}`);
  console.log(`${colors.yellow}ID:${colors.reset} ${post.id}`);
  console.log(`${colors.yellow}Title:${colors.reset} ${post.title}`);
  console.log(`${colors.yellow}Author:${colors.reset} ${post.authorName}`);
  console.log(`${colors.yellow}Created:${colors.reset} ${post.createdAt.toLocaleString()}`);
  console.log(`${colors.yellow}Content:${colors.reset}\n${post.content}`);
  if (post.imageUrl) {
    console.log(`${colors.yellow}Image:${colors.reset} ${post.imageUrl}`);
  }
  console.log(`${colors.cyan}================================${colors.reset}\n`);
}

// =====================================================
// ============ Emergency Tips Management ==============
// =====================================================
async function getTips() {
  try {
    const q = query(collection(db, 'emergency_tips'), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    return snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate() || new Date(),
    }));
  } catch (err) {
    console.error(colors.red, 'Error fetching tips:', err, colors.reset);
    return [];
  }
}

async function addTip(category, title, description, createdBy = "adminUID") {
  try {
    await addDoc(collection(db, 'emergency_tips'), {
      category, title, description,
      createdBy, createdAt: new Date()
    });
    console.log(`${colors.green}✅ Tip added!${colors.reset}`);
  } catch (err) {
    console.error(colors.red, 'Error adding tip:', err, colors.reset);
  }
}

async function updateTip(tipId, updates) {
  try {
    await updateDoc(doc(db, 'emergency_tips', tipId), {
      ...updates,
      updatedAt: new Date()
    });
    console.log(`${colors.green}✅ Tip updated!${colors.reset}`);
  } catch (err) {
    console.error(colors.red, 'Error updating tip:', err, colors.reset);
  }
}

async function deleteTip(tipId) {
  try {
    await deleteDoc(doc(db, 'emergency_tips', tipId));
    console.log(`${colors.green}✅ Tip deleted!${colors.reset}`);
  } catch (err) {
    console.error(colors.red, 'Error deleting tip:', err, colors.reset);
  }
}

// =====================================================
// ============== Main CLI for Forum Posts =============
// =====================================================
async function main() {
  console.log(`${colors.blue}🔥 Firebase Forum Admin Tool${colors.reset}`);
  console.log(`${colors.blue}==============================${colors.reset}\n`);

  const posts = await getPendingPosts();
  if (posts.length === 0) {
    console.log(`${colors.green}✨ No pending posts to review!${colors.reset}`);
    return;
  }

  console.log(`${colors.yellow}Found ${posts.length} pending post(s):${colors.reset}\n`);

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    displayPost(post, i);

    const action = await new Promise((resolve) => {
      readline.question(
        `${colors.magenta}Actions: [a]pprove, [r]eject, [s]kip, [q]uit: ${colors.reset}`,
        resolve
      );
    });

    switch (action.toLowerCase()) {
      case 'a':
      case 'approve':
        const approveNotes = await new Promise((resolve) => {
          readline.question(`${colors.blue}Admin notes (optional): ${colors.reset}`, resolve);
        });
        await approvePost(post.id, approveNotes);
        break;

      case 'r':
      case 'reject':
        const rejectNotes = await new Promise((resolve) => {
          readline.question(`${colors.red}Rejection reason: ${colors.reset}`, resolve);
        });
        await rejectPost(post.id, rejectNotes);
        break;

      case 's':
      case 'skip':
        console.log(`${colors.yellow}⏭️  Skipped${colors.reset}`);
        break;

      case 'q':
      case 'quit':
        console.log(`${colors.blue}👋 Goodbye!${colors.reset}`);
        readline.close();
        return;

      default:
        console.log(`${colors.red}Invalid action. Skipping...${colors.reset}`);
        break;
    }
  }

  console.log(`${colors.green}✅ Finished reviewing all posts!${colors.reset}`);
  readline.close();
}

// Run the forum review CLI
main().catch(console.error);

// =====================================================
// ============== Module Exports =======================
// =====================================================
module.exports = {
  // Forum
  getPendingPosts, approvePost, rejectPost,
  // Emergency Tips
  getTips, addTip, updateTip, deleteTip
};
