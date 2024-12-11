// Select the necessary elements
const guessInput = document.getElementById("guess");
const submitButton = document.getElementById("submitGuess");
const message = document.getElementById("message");
const attemptsText = document.getElementById("attempts");

let randomNumber = Math.floor(Math.random() * 100) + 1;
let attempts = 0;

// Function to check the player's guess
function checkGuess() {
    const playerGuess = parseInt(guessInput.value);

    if (isNaN(playerGuess) || playerGuess < 1 || playerGuess > 100) {
        message.textContent = "Please enter a valid number between 1 and 100!";
        message.style.color = "red";
        return;
    }

    attempts++;
    attemptsText.textContent = `Attempts: ${attempts}`;

    if (playerGuess === randomNumber) {
        message.textContent = `Congratulations! You guessed the correct number: ${randomNumber}`;
        message.style.color = "green";
        message.style.fontWeight = "bold";
        submitButton.disabled = true;  // Disable the button after correct guess
    } else if (playerGuess < randomNumber) {
        message.textContent = "Too low! Try again.";
        message.style.color = "blue";
    } else {
        message.textContent = "Too high! Try again.";
        message.style.color = "blue";
    }

    guessInput.value = ''; // Clear the input after each guess
    guessInput.focus(); // Focus on the input for the next guess
}

// Event listener for button click
submitButton.addEventListener("click", checkGuess);

// Optional: Allow pressing "Enter" to submit the guess
guessInput.addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
        checkGuess();
    }
});
