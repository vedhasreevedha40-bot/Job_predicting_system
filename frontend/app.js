import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { 
    getFirestore, 
    doc,
    collection,
    addDoc,
    setDoc, 
    getDoc, 
    updateDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCeTGWnDOdi7qQxJEupBjfcBgV1nliJkJE",
    authDomain: "edu2job-e669e.firebaseapp.com",
    projectId: "edu2job-e669e",
    storageBucket: "edu2job-e669e.firebasestorage.app",
    appId: "1:1044514172182:web:33ef6a7e1e70b03d673437"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// --- 1. EMAIL/PASSWORD LOGIN ---
window.loginUser = async (e) => {
    if (e) e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        alert("Login Successful!");
        window.location.href = "dashboard.html";
    } catch (error) {
        console.error("Login Error:", error.code);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            alert("Invalid email or password. Please try again.");
        } else {
            alert("Login failed: " + error.message);
        }
    }
};

// --- 1.5 EMAIL/PASSWORD SIGNUP ---
window.handleSignup = async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    try {
        await createUserWithEmailAndPassword(auth, email, password);
        alert("Account Created Successfully!");
        window.location.href = "dashboard.html";
    } catch (error) {
        console.error("Signup Error:", error.code);
        alert("Signup failed: " + error.message);
    }
};

// --- 2. GOOGLE LOGIN ---
window.googleLogin = async () => {
    try {
        const result = await signInWithPopup(auth, provider);
        // log google login
        try { await logLoginEvent('google', result.user); } catch (e) { console.warn('Login log failed', e); }
        window.location.href = "dashboard.html";
    } catch (e) {
        alert("Login failed. Check browser popup blockers!");
    }
};

// --- Login logging helper (module scope) ---
async function logLoginEvent(method, user) {
    if (!db) return;
    try {
        await addDoc(collection(db, 'logins'), {
            uid: user?.uid || null,
            email: user?.email || '',
            method,
            userAgent: (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '',
            timestamp: serverTimestamp()
        });
    } catch (err) {
        console.warn('Could not write login event to Firestore:', err && err.message ? err.message : err);
    }
}

// --- 3. SAVE PROFILE DATA (from education.html) ---
window.saveEducation = async (e) => {
    if (e) e.preventDefault();
    const user = auth.currentUser;
    if (!user) return alert("Please log in first!");

    const profileData = {
        university: document.getElementById('university').value,
        branch: document.getElementById('branch').value,
        cgpa: document.getElementById('cgpa').value,
        year: document.getElementById('year').value
    };

    try {
        await setDoc(doc(db, "users", user.uid), profileData, { merge: true });
        alert("Details Saved!");
        window.location.href = "dashboard.html"; 
    } catch (err) {
        console.error(err);
        alert("Permission Denied! Check Firestore Rules.");
    }
};

// --- 4. PREDICT JOBS & SAVE ---
window.predictJobs = async () => {
    const fileInput = document.getElementById('resumeUpload');
    const user = auth.currentUser;
    if (!fileInput.files[0]) return alert("Please upload a resume first!");

    const formData = new FormData();
    formData.append('resume', fileInput.files[0]);

    try {
        const res = await fetch('http://127.0.0.1:5000/predict', { method: 'POST', body: formData });
        const data = await res.json();
        
        await updateDoc(doc(db, "users", user.uid), { recentPredictions: data.jobs });
        alert("Prediction Successful!");
        window.location.href = "dashboard.html";
    } catch (e) {
        alert("ML Server Error: Ensure 'python app.py' is running on port 5000!");
    }
};

// --- 5. TOGGLE SECTIONS (Dashboard vs Insights) ---
window.showSection = (sectionId) => {
    const insights = document.getElementById('insights-section');
    const dashboard = document.getElementById('dashboard-section');

    if (sectionId === 'insights') {
        if(insights) insights.classList.remove('hidden');
        if(dashboard) dashboard.classList.add('hidden');
        // Wait for the browser to apply layout so Chart.js can measure canvas sizes correctly
        requestAnimationFrame(() => {
            renderInsights(); // Trigger chart drawing
            // Give Chart.js a short moment to settle, then force resize on charts
            setTimeout(() => {
                if (window._insightCharts) {
                    Object.values(window._insightCharts).forEach(c => { try { c.resize(); } catch (e) {} });
                }
            }, 50);
        });
    } else {
        if(insights) insights.classList.add('hidden');
        if(dashboard) dashboard.classList.remove('hidden');
    }
};

// --- 6. RENDER INSIGHTS (Charts based on predictions) ---
async function renderInsights() {
    // Allow rendering demo charts even when user not signed-in.
    const user = auth.currentUser;
    let predictions = [];
    let isDemo = false;

    if (!user) {
        isDemo = true;
        predictions = ['Software Engineer','Data Scientist','Product Manager','Software Engineer','Data Scientist','QA Engineer','Product Manager'];
    } else {
        try {
            const docRef = doc(db, "users", user.uid);
            const snapshot = await getDoc(docRef);
            if (snapshot.exists() && Array.isArray(snapshot.data().recentPredictions) && snapshot.data().recentPredictions.length > 0) {
                predictions = snapshot.data().recentPredictions;
            } else {
                isDemo = true;
                predictions = ['Software Engineer','Data Scientist','Product Manager','Software Engineer','Data Scientist','QA Engineer','Product Manager'];
            }
        } catch (err) {
            console.warn('Could not reach Firestore. Rendering demo insights.', err && err.message ? err.message : err);
            isDemo = true;
            predictions = ['Software Engineer','Data Scientist','Product Manager','Software Engineer','Data Scientist','QA Engineer','Product Manager'];
        }
    }

    // Show or update a small notice in the insights section when using demo data
    const insightsEl = document.getElementById('insights-section');
    if (insightsEl) {
        let note = document.getElementById('insights-note');
        if (!note) {
            note = document.createElement('div');
            note.id = 'insights-note';
            note.className = 'max-w-6xl mx-auto mb-4 px-4 py-2 rounded text-sm';
            insightsEl.prepend(note);
        }
        if (isDemo) {
            note.innerText = 'Showing demo predictions — upload resumes or run real predictions to see personalized data.';
            note.classList.add('bg-yellow-100', 'text-yellow-800');
        } else {
            note.innerText = '';
            note.className = 'max-w-6xl mx-auto mb-4 px-4 py-2 rounded text-sm';
        }
    }

    // Process data for Chart.js
    const counts = {};
    predictions.forEach(job => { counts[job] = (counts[job] || 0) + 1; });

    const labels = Object.keys(counts);
    const dataValues = Object.values(counts);

    // Safely destroy previous charts to avoid duplicates
    window._insightCharts = window._insightCharts || {};
    ['pie', 'bar', 'line'].forEach(k => {
        if (window._insightCharts[k]) {
            try { window._insightCharts[k].destroy(); } catch (e) {}
        }
    });

    // Pie Chart
    window._insightCharts.pie = new Chart(document.getElementById('domainPieChart').getContext('2d'), {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: ['#4f46e5', '#818cf8', '#c7d2fe', '#312e81', '#60a5fa', '#7c3aed']
            }]
        },
        options: { maintainAspectRatio: false }
    });

    // Bar Chart
    window._insightCharts.bar = new Chart(document.getElementById('roleBarChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Match Frequency',
                data: dataValues,
                backgroundColor: '#4f46e5'
            }]
        },
        options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });

    // Line Chart: show per-prediction trend by building cumulative series per role
    const seqLabels = predictions.map((_, i) => `#${i+1}`);
    const uniqueRoles = labels;
    const colorPool = ['#4f46e5', '#06b6d4', '#f97316', '#ef4444', '#10b981', '#8b5cf6'];

    const datasets = uniqueRoles.map((role, idx) => {
        let cum = 0;
        const dataSeries = predictions.map(p => {
            if (p === role) cum += 1;
            return cum;
        });
        return {
            label: role,
            data: dataSeries,
            borderColor: colorPool[idx % colorPool.length],
            backgroundColor: colorPool[idx % colorPool.length],
            fill: false,
            tension: 0.2,
            pointRadius: 2
        };
    });

    window._insightCharts.line = new Chart(document.getElementById('trendLineChart').getContext('2d'), {
        type: 'line',
        data: {
            labels: seqLabels,
            datasets: datasets
        },
        options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
    });
}

// --- 7. AUTH STATE LISTENER (Load Data) ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        if (window.location.pathname.includes("dashboard.html")) {
            try {
                const docRef = doc(db, "users", user.uid);
                const snapshot = await getDoc(docRef);

                if (snapshot && snapshot.exists()) {
                    const data = snapshot.data();
                    if(document.getElementById('display-university')) 
                        document.getElementById('display-university').innerText = data.university || "Not Set";
                    if(document.getElementById('display-branch')) 
                        document.getElementById('display-branch').innerText = data.branch || "Not Set";
                    if(document.getElementById('display-cgpa')) 
                        document.getElementById('display-cgpa').innerText = data.cgpa || "0.00";
                    if(document.getElementById('display-year')) 
                        document.getElementById('display-year').innerText = data.year || "N/A";

                    const list = document.getElementById('last-predictions-list');
                    if (list) {
                        if (data.recentPredictions && data.recentPredictions.length > 0) {
                            list.innerHTML = data.recentPredictions.map(job => 
                                `<div class="p-3 bg-indigo-50 border-l-4 border-indigo-600 mb-2 font-bold text-indigo-900 rounded-r-lg">${job}</div>`
                            ).join('');
                        } else {
                            list.innerHTML = `<p class="text-slate-400 italic">No predictions found. Upload your resume.</p>`;
                        }
                    }
                }
            } catch (err) {
                console.warn('Unable to fetch user data from Firestore:', err && err.message ? err.message : err);
                // keep UI usable with defaults; do not block page
            }
        }
    } else {
        const protectedPages = ["dashboard.html", "education.html", "job-prediction.html"];
        if (protectedPages.some(page => window.location.pathname.includes(page))) {
            window.location.href = "index.html"; 
        }
    }
});

// --- 8. LOGOUT ---
window.logout = () => signOut(auth).then(() => window.location.href = "index.html");

// --- 9. FEEDBACK SUBMIT ---
window.submitFeedback = async (e) => {
    if (e) e.preventDefault();
    const name = document.getElementById('fb-name')?.value || '';
    const email = document.getElementById('fb-email')?.value || '';
    const message = document.getElementById('fb-message')?.value || '';

    if (!name || !email || !message) return alert('Please complete all fields.');

    try {
        const res = await fetch('http://127.0.0.1:5000/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, message })
        });

        const data = await res.json();
        if (res.ok) {
            alert('Feedback sent — thank you!');
            window.location.href = 'index.html';
        } else {
            alert('Could not send feedback: ' + (data.error || res.statusText));
        }
    } catch (err) {
        console.error('Feedback send error', err);
        alert('Network error: ensure backend is running on port 5000');
    }
};

// --- 10. ADMIN: FETCH & RENDER FEEDBACKS ---
function escapeHTML(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

window.loadAdminFeedbacks = async () => {
    const container = document.getElementById('feedback-table');
    if (!container) return;
    try {
        const res = await fetch('http://127.0.0.1:5000/feedbacks');
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            container.innerHTML = '<p class="text-slate-500 italic">No feedback yet.</p>';
            return;
        }

        const rows = data.map(f => `
            <tr class="border-b">
                <td class="px-4 py-2 whitespace-nowrap">${escapeHTML(f.timestamp || '')}</td>
                <td class="px-4 py-2">${escapeHTML(f.name || '')}</td>
                <td class="px-4 py-2">${escapeHTML(f.email || '')}</td>
                <td class="px-4 py-2">${escapeHTML(f.message || '')}</td>
            </tr>
        `).join('');

        container.innerHTML = `
            <div class="overflow-x-auto">
            <table class="min-w-full text-left">
                <thead class="bg-slate-100">
                    <tr>
                        <th class="px-4 py-2">Time (UTC)</th>
                        <th class="px-4 py-2">Name</th>
                        <th class="px-4 py-2">Email</th>
                        <th class="px-4 py-2">Message</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows}
                </tbody>
            </table>
            </div>
        `;
    } catch (err) {
        container.innerHTML = '<p class="text-red-500">Error loading feedbacks. Is backend running?</p>';
        console.error('Admin fetch error', err);
    }
};

if (window.location.pathname.includes('admin.html')) {
    window.addEventListener('DOMContentLoaded', () => window.loadAdminFeedbacks());
}