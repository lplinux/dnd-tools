# Small fixes
## General
* Add template color selector on all modules among the Login button or the Account button (if logged in)
* Item Card form should be cleared every time the "Item Type" is changed
* Refactor CSS code to be DRY

## Journey Path Map
* Display the information of the paths
* Waypoints should contain the name of the location if put/drawn on a location
    * If put in a place without a location, it should create a new Location and add it to the Campaign
* Distance should be calculated if possible by the distance between locations
* onWheel for zoom-in/out should be focused on the pointer as center
* A waypoint could be edited and linked to an Event on any Timeline for the Campaign

## PC Sheet
* Image for PC should be uploaded and stored on the DB
    * Limit the size of the image to 106x136px and 100kb
    * Allow Image URL as alternative