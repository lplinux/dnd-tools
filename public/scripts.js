document.getElementById('caster-type-dropdown-menu').addEventListener('change', function () {
  const casterType = this.value;
  const spellRows = document.querySelectorAll('.spell-list-row');
  const spellsContainer = document.querySelector('.spells-container');

  // Hide the spells-container if Caster Type is None
  if (casterType === 'none') {
    spellsContainer.style.display = 'none';
    return; // Exit the function early
  } else {
    spellsContainer.style.display = 'contents'; // Show the spells-container for other caster types
  }

  // Hide all spell levels and their checkboxes by default
  spellRows.forEach(row => {
    row.style.display = 'none';
    const checkboxes = row.querySelectorAll('.spell-checkboxes input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.style.display = 'none';
    });
  });

  // Show spell levels and checkboxes based on the selected caster type
  switch (casterType) {
    case 'full': // Full Caster
      showSpellLevels([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      break;
    case 'half': // Half Caster
      showSpellLevels([0, 1, 2, 3, 4, 5]);
      break;
    case 'third': // Third Caster
      showSpellLevels([0, 1, 2, 3, 4]);
      break;
    case 'warlock': // Warlock
      showSpellLevels([0, 5]); // Adjust based on Warlock spell slot progression
      break;
    default:
      break;
  }
});

function showSpellLevels(levels) {
  levels.forEach(level => {
    const row = document.querySelector(`.spell-list-row:nth-child(${level + 1})`);
    if (row) {
      row.style.display = 'contents'; // Ensure each row is displayed on its own line

      // Show checkboxes for the current spell level
      const checkboxes = row.querySelectorAll('.spell-checkboxes input[type="checkbox"]');
      checkboxes.forEach(checkbox => {
        checkbox.style.display = 'inline-block'; // Show checkboxes
      });
    }
  });
}

document.querySelectorAll('textarea').forEach(textarea => {
  textarea.addEventListener('input', function () {
    this.style.height = 'auto'; // Reset the height to auto to calculate the new height
    this.style.height = this.scrollHeight + 'px'; // Set the height to match the content
  });
});

document.querySelectorAll('.subline-input').forEach(input => {
  input.style.fontSize = '12px'; // Set a consistent starting font size
  input.addEventListener('input', function () {
    const maxFontSize = 12; // Maximum font size
    const minFontSize = 12; // Minimum font size
    const length = this.value.length;

    // Adjust font size based on content length
    if (length === 0) {
      this.style.fontSize = `${maxFontSize}px`; // Reset to max size if empty
    } else {
      const newFontSize = Math.max(minFontSize, maxFontSize - length);
      this.style.fontSize = `${newFontSize}px`;
    }
  });
});
