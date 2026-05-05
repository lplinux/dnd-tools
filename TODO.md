# TODO

## General

- [ ] Add theme/colour selector accessible from all modules (near Login / Account button)
- [ ] Refactor CSS — extract shared variables and component styles into `styles.css` to reduce duplication across HTML files
- [ ] Item Card form fields should reset when "Item Type" is changed
- [ ] Pressing "Enter" key should not trigger a lot of submits but only the ones I'm writing or I have open
- [ ] Adjust README files for modules related to Export and Import
    - [ ] JSON Schema is based on a full export

### Import/Export
- [ ] Allow Export/Import in multiple modules as Json.
    - [ ] Add to the README of each module a template of Json to use to import
To test this, first complete a demo Campaign with some examples and then export it. Use the export as example for the README and also to test on a clean DB the import.
- [ ] Test with a clean slade the full code

## Journey Path Map

- [ ] Public view (`journey-map-public.html`): display waypoint location names and linked event info on the read-only map as hover
- [ ] Import Journey Map gives an error. Test with an exported json from a manual map

## PC Sheet

- [ ] Caster Type should be blocked depending on the slected Class 
- [ ] Prepare for Multi-Class
- [ ] Relationship graph sometimes doesn't fit the screen or is wrongly rendered

## Timeline

- [ ] Add button to Delete Timeline
- [ ] Hide "New Timeline" when "World Timeline" is selected