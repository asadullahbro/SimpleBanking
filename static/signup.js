const form = document.querySelector('.signup-container form');
const usernameInput = document.getElementById('new-username');
const passwordInput = document.getElementById('new-password');

const modal = document.getElementById('signupModal');
const modalTitle = document.getElementById('modalTitle');
const modalMessage = document.getElementById('modalMessage');
const closeModal = document.getElementById('closeModal');

closeModal.addEventListener('click', () => {
    modal.style.display = 'none';
});

form.addEventListener('submit', async (event) => {
    event.preventDefault(); // prevent default form submission

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    // Basic validation
    if (username.length < 4) {
        showModal('Error', 'Username must be at least 4 characters long.');
        return;
    }
    if (password.length < 6) {
        showModal('Error', 'Password must be at least 6 characters long.');
        return;
    }
    const form = new FormData();
    form.append('username', username);
    form.append('password', password);
    try {
        const res = await fetch('http://127.0.0.1:8000/signup', {
            method: 'POST',
            body: form
        });

        const data = await res.json();

        if (res.ok) {
            showModal('Success', 'Your account has been created! You can now log in.', true);
        } else {
            // Handle validation errors from FastAPI
            let msg = '';
            if (Array.isArray(data)) {
                msg = data.map(e => e.msg).join('\n');
            } else if (data.detail) {
                msg = data.detail;
            } else {
                msg = 'Signup failed. Please try again.';
            }
            showModal('Error', msg);
        }
    } catch (err) {
        console.error('Error during signup:', err);
        showModal('Error', 'An unexpected error occurred. Please try again later.');
    }
});

// Show modal function
function showModal(title, message, redirect = false) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modal.style.display = 'flex';

    if (redirect) {
        closeModal.onclick = () => {
            modal.style.display = 'none';
            window.location.href = 'login';
        }
    } else {
        closeModal.onclick = () => {
            modal.style.display = 'none';
        }
    }
}

// Optional: realtime border color feedback
usernameInput.addEventListener('input', () => {
    usernameInput.style.borderColor = usernameInput.value.length >= 4 ? '#4ade80' : '#ff6b6b';
});
passwordInput.addEventListener('input', () => {
    passwordInput.style.borderColor = passwordInput.value.length >= 6 ? '#4ade80' : '#ff6b6b';
});
