(function () {
  var loginPath = "/";
  var currentPath = window.location.pathname.replace(/\/+$/, "") || "/";
  if (currentPath === loginPath) return;

  try {
    if (!localStorage.getItem("pmpUser")) {
      window.location.replace(loginPath);
    }
  } catch {
    window.location.replace(loginPath);
  }
})();
