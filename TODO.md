# Small fixes
## General
* Add template color selector on all modules among the Login button or the Account button (if logged in)
* Item Card form should be cleared every time the "Item Type' is changed
* Refactor CSS code to be DRY

## Manage Campaigns
### General Features
* Create "private" timelines from the Manage Campaigns module as well as from the Timeline Module
    * There should be a button to create Timelines and assign them to Players

## Timeline
* Combined Timeline for DMs should only display 1 graph ("Combined view - Read Only" should be removed)
    * A button to create a public link for the combined view
    * Events in this view should not be editable

## Journey Path Map
* Players for the Campaign should appear as Trackers (they should not be deleted)
* Locations can be pinned only once
* Pick location list should only show those that are not pinned yet
* Pin for location is not set correctly
* Changing tools (select/move, place location, pan, etc) should have shortcuts (the button should show the shortcut)
    * Pan should be able to be done by holding the Alt/command key in the keyboard (the button should show the shortcut)
* Distance Matrix should be a menu/section to configure and check it independently of the map
* Distance Matrix doesn't refresh automatically when save the distance
* Distances Time measure for walking, riding, flying should be taken as 8 hours per day of movement and not 24 hours. Rounded up in days.
* Display the information of the paths