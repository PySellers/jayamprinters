document.addEventListener("DOMContentLoaded", function () {
  var quoteForm = document.getElementById("quote-form");
  var quoteResult = document.getElementById("quote-result");

  if (!quoteForm || !quoteResult) {
    return;
  }

  quoteForm.addEventListener("submit", function (event) {
    event.preventDefault();

    var project = document.getElementById("project").value;
    var quantity = parseInt(document.getElementById("quantity").value, 10);

    if (!project || !quantity || quantity <= 0) {
      quoteResult.textContent = "Please select a project type and enter a valid quantity.";
      quoteResult.style.display = "block";
      return;
    }

    var basePrices = {
      flyer: 1.5,
      "business-card": 0.35,
      banner: 12,
      stationery: 2.5,
    };

    var projectName = {
      flyer: "Flyer or Brochure",
      "business-card": "Business Cards",
      banner: "Banner or Poster",
      stationery: "Stationery",
    };

    var estimate = basePrices[project] * quantity;
    quoteResult.textContent = "Estimated price for " + projectName[project] + ": ₹" + estimate.toFixed(2) + ".";
    quoteResult.style.display = "block";
  });
});
