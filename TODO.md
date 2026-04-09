# Small fixes
## Timeline
* `fill="var(--text-muted)"` aparently is not been hidden, but everything is being overlaped at the end of the timeline
* Events happening during an event with duration higher than 1 day should have timeline lines connection from and to the long duration event
* Drag and Drop events changing the date sometimes make the events overlap between them
* On long duration events, the "end" icon should be behind the "start" icon
* When zoomed-in, sometimes lines doesn't show with events too close together
* Event's card for long duration events should show the end date in addition to the duration
* Color on Players should be editable by clicking on the color
* Names (location, players, etc) with single quote in the string fails to be hidden and deleted - Error: toggleLocVis('Baldur's Gate') -
* Long duration events shadow/line should appear even on top of the collapsed timeframes
* Long duration events shadow/line not be overlap by any other event


# Breaking changes
## General
* Add authentication for the system
* Add a DB to store sensitive information

## Timeline
* Timeline module stores data on the browser cache. First improvement would be to store the data on disk and then on a DB
