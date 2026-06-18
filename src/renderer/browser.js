const params = new URLSearchParams(location.search);
const serviceView = document.querySelector('#serviceView');
const pageTitle = document.querySelector('#pageTitle');
const pageUrl = document.querySelector('#pageUrl');
const loadingBar = document.querySelector('#loadingBar');
const initialTitle = params.get('title') || '학교 서비스';
const initialUrl = params.get('url') || 'about:blank';

pageTitle.textContent = initialTitle;
pageUrl.textContent = initialUrl;
serviceView.src = initialUrl;

function updateNavigation() {
  document.querySelector('#backBtn').disabled = !serviceView.canGoBack();
  document.querySelector('#forwardBtn').disabled = !serviceView.canGoForward();
  pageUrl.textContent = serviceView.getURL() || initialUrl;
}

document.querySelector('#closeBtn').addEventListener('click', () => window.browserControls.close());
document.querySelector('#minimizeBtn').addEventListener('click', () => window.browserControls.minimize());
document.querySelector('#portalBtn').addEventListener('click', () => window.browserControls.portal());
document.querySelector('#homeBtn').addEventListener('click', () => window.browserControls.portal());
document.querySelector('#backBtn').addEventListener('click', () => serviceView.canGoBack() && serviceView.goBack());
document.querySelector('#forwardBtn').addEventListener('click', () => serviceView.canGoForward() && serviceView.goForward());
document.querySelector('#reloadBtn').addEventListener('click', () => serviceView.reload());

serviceView.addEventListener('did-start-loading', () => {
  loadingBar.className = 'loading-bar active';
});
serviceView.addEventListener('did-stop-loading', () => {
  loadingBar.className = 'loading-bar done';
  setTimeout(() => { loadingBar.className = 'loading-bar'; }, 220);
  updateNavigation();
});
serviceView.addEventListener('did-navigate', updateNavigation);
serviceView.addEventListener('did-navigate-in-page', updateNavigation);
serviceView.addEventListener('page-title-updated', (event) => {
  pageTitle.textContent = event.title || initialTitle;
});
serviceView.addEventListener('new-window', (event) => {
  event.preventDefault();
  if (event.url) serviceView.loadURL(event.url);
});
