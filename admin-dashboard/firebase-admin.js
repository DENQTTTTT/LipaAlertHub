// firebase-admin.js - Script to manually approve forum posts
// Run this with Node.js to manage posts from your computer

const { initializeApp } = require('firebase/app');
const { 
  getFirestore, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc,
  orderBy 
} = require('firebase/firestore');

// Your Firebase config - replace with your actual config
const firebaseConfig = {
  // Copy your Firebase config here
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  reset: '\x1b[0m'
};

// Get pending posts
async function getPendingPosts() {
  try {
    const q = query(
      collection(db, 'forumPosts'),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    const posts = [];

    querySnapshot.forEach((doc) => {
      const data = doc.data();
      posts.push({
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
      });
    });

    return posts;
  } catch (error) {
    console.error('Error fetching posts:', error);
    return [];
  }
}

// Approve a post
async function approvePost(postId, adminNotes = '') {
  try {
    const postRef = doc(db, 'forumPosts', postId);
    await updateDoc(postRef, {
      status: 'approved',
      adminNotes: adminNotes,
      reviewedAt: new Date(),
    });
    console.log(`${colors.green}✅ Post approved successfully!${colors.reset}`);
  } catch (error) {
    console.error('Error approving post:', error);
  }
}

// Reject a post
async function rejectPost(postId, adminNotes = '') {
  try {
    const postRef = doc(db, 'forumPosts', postId);
    await updateDoc(postRef, {
      status: 'rejected',
      adminNotes: adminNotes,
      reviewedAt: new Date(),
    });
    console.log(`${colors.red}❌ Post rejected.${colors.reset}`);
  } catch (error) {
    console.error('Error rejecting post:', error);
  }
}

// Display a post
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

// Main interactive function
async function main() {
  console.log(`${colors.blue}🔥 Firebase Forum Admin Tool${colors.reset}`);
  console.log(`${colors.blue}==============================${colors.reset}\n`);

  const posts = await getPendingPosts();

  if (posts.length === 0) {
    console.log(`${colors.green}✨ No pending posts to review!${colors.reset}`);
    return;
  }

  console.log(`${colors.yellow}Found ${posts.length} pending post(s) for review:${colors.reset}\n`);

  // Simple command line interface
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

// Run the admin tool
main().catch(console.error);

// Export functions for other uses
module.exports = {
  getPendingPosts,
  approvePost,
  rejectPost
};