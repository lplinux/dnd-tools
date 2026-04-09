# Small fixes
## Timeline
* `fill="var(--text-muted)"` aparently is not been hidden, but everything is being overlaped at the end of the timeline
* Events on the left side of the timeline are put behind the Date column
* Events with a duration that cross over condensed timeframes doesn't continue the color after the timeframe

# Breaking changes
## General
* Add authentication for the system
* Add a DB to store sensitive information

## Timeline
* Timeline module stores data on the browser cache. First improvement would be to store the data on disk and then on a DB
