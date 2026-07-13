const header = document.getElementById('header');

window.addEventListener('scroll', () => {
    header.classList.toggle('is-scrolled', window.scrollY >= 100);
});

const navToggle = document.getElementById('navToggle');
const navbar = document.getElementById('navbar');

if (navToggle && navbar) {
    navToggle.addEventListener('click', () => {
        const isOpen = navbar.classList.toggle('is-open');
        navToggle.classList.toggle('is-active', isOpen);
        navToggle.setAttribute('aria-expanded', isOpen);
    });

    navbar.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navbar.classList.remove('is-open');
            navToggle.classList.remove('is-active');
            navToggle.setAttribute('aria-expanded', 'false');
        });
    });
}
