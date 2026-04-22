// VULNERABLE CODE (line 66)
const userInput = getUserData();
document.getElementById('content').innerHTML = userInput;

// FIXED CODE - Option 1: Use textContent for plain text
const userInput = getUserData();
document.getElementById('content').textContent = userInput;

// FIXED CODE - Option 2: Use DOMPurify for HTML content
const userInput = getUserData();
const cleanHTML = DOMPurify.sanitize(userInput);
document.getElementById('content').innerHTML = cleanHTML;

// FIXED CODE - Option 3: Use createElement for safe DOM manipulation
const userInput = getUserData();
const container = document.getElementById('content');
container.innerHTML = '';
const textNode = document.createTextNode(userInput);
container.appendChild(textNode);