// Copy and paste these lines into the browser console one at a time

// Step 1: Complete onboarding programmatically
state.onboarded = true;
state.skills = ["Python", "JavaScript"];
state.topics = ["Machine Learning", "Sustainability"];
state.minutes = 6;
studentProfile.languages = ["Python", "JavaScript"];
studentProfile.interests = ["Machine Learning", "Sustainability"];
studentProfile.hours_per_week = 6;
save();

// Step 2: Render the page
render();

// Step 3: Check if cards are showing
console.log("Feed has", feed().length, "projects");
