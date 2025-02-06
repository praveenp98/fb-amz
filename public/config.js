const firebaseConfig = {
    apiKey: "AIzaSyBworRbpILv8CwwU-dZ7dys7RF5s9df_cQ",
    authDomain: "facebook-ads-automation-a0377.firebaseapp.com",
    projectId: "facebook-ads-automation-a0377",
    storageBucket: "facebook-ads-automation-a0377.appspot.com",
    messagingSenderId: "205869884884",
    appId: "1:205869884884:web:825dc8642b6b1c45a3a241",
    measurementId: "G-TQ59KQBMJX"
};

try {
    firebase.initializeApp(firebaseConfig);
    console.log('Firebase initialized successfully');
} catch (error) {
    console.error('Error initializing Firebase:', error);
}
