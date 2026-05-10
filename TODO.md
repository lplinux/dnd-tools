# TODO

## Refactor
### General

- [ ] Add theme/colour selector accessible from all modules (near Login / Account button)
- [ ] Refactor CSS — extract shared variables and component styles into `styles.css` to reduce duplication across HTML files
- [ ] Pressing "Enter" key should not trigger a lot of submits but only the ones I'm writing or I have open
- [ ] Import/Export should not contain IDs when not strictly necessary
- [ ] Export files should have by default the date of the export
- [ ] Locations with the same Name should not be created

### Journey Path Map

- [ ] Refactor Distance Matrix:
    - [ ] Instead of distance between locations, build a `Route System` where routes are drawn and distance is set by `Route Section`

## Fixes
### Item Card

- [ ] Item Card form fields should reset when "Item Type" is changed

### Journey Path Map

- [ ] Public view (`journey-map-public.html`): display waypoint location names and linked event info on the read-only map as hover
- [ ] Distance Matrix Modal: locations row/column should stay while scrolling
    - [ ] The row looks weird when scrolling horizontally as it shows some text on the left side

### PC Sheet

- [ ] Caster Type should be blocked depending on the selected Class 
- [ ] Prepare for Multi-Class

### Manage Campaign

- [ ] Reorganize the Graph with every new connection so lines doesn't cross too much

### Timeline

- [ ] Export Timeline should contain the name of the timeline and not "Demo-Campaign"