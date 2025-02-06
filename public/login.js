const auth = firebase.auth();
const loginBtn = document.getElementById('login-btn');

// Check if user is already logged in
auth.onAuthStateChanged((user) => {
    if (user) {
        window.location.href = '/index.html';
    }
});

// Login with Google
loginBtn.addEventListener('click', () => {
    const provider = new firebase.auth.GoogleAuthProvider();
    auth.signInWithPopup(provider)
        .then(() => {
            window.location.href = '/index.html';
        })
        .catch((error) => {
            console.error('Login error:', error);
            alert('Failed to login. Please try again.');
        });
});
