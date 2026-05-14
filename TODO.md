# TODO

## Refactor
### General

- [ ] Add theme/colour selector accessible from all modules (near Login / Account button)
- [ ] Refactor CSS — extract shared variables and component styles into `styles.css` to reduce duplication across HTML files
- [ ] Pressing "Enter" key should not trigger a lot of submits but only the ones I'm writing or I have open
- [ ] Export files should have by default the date of the export
- [ ] Locations with the same Name should not be created on the same Campaign (either by import)
- [ ] "Information" modal should be closed when clicking outside the modal

### Journey Path Map

- [ ] Refactor Distance Matrix:
    - [ ] Instead of distance between locations, build a `Route System` where routes are drawn and distance is set by `Route Section`

## Fixes
### Item Card

- [ ] Item Card form fields should reset when "Item Type" is changed

### Journey Path Map

- [ ] Distance Matrix Modal: locations row/column should stay while scrolling
    - [ ] The row looks weird when scrolling horizontally as it shows some text on the left side

### PC Sheet

- [ ] Caster Type should be blocked depending on the selected Class 
- [ ] Prepare for Multi-Class

### Manage Campaign

- [ ] Reorganize the Graph with every new connection so lines doesn't cross too much

### Timeline

- [ ] Export Timeline should contain the name of the timeline and not "Demo-Campaign"
- [ ] DM Timelines are not being exported correctly as the `player_id_refs` are not the same after importing. Export should convert `ids` into Names and then Import should do the oposite once the NPCs, Players and Relationships are created.