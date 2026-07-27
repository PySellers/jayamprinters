document.addEventListener("DOMContentLoaded", function () {
  var forms = document.querySelectorAll("form");
  forms.forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      alert("Thank you! Your request has been received.");
      form.reset();
    });
  });
});
