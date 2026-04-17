# Small fixes
## General
* Enter key should ADD/SAVE/accept/etc
* Ensure all the modules have the "Go back" button as a pop up in the right bottom corner 
* Any endpoint that is protected should redirect to the index.html instead of returning an unauthorized error

## item-cards
* Print should only print the end card with format as seen in the browser (look&feel).
    * If not possible, we can use an image as background as in the `original` module

## Players Character (PC) chart
### Player Panel
* Image is missing when generating the PDF to print

## Timeline
* There should be 2 types of `timeline`: 
    * public:
        * Only mode for non-authenticated users
        * Store data on browser cache
    * private:
        * Requires a Campaign to be selected and a Player
        * Data must be stored on the DB and timeline should belong to a player and a campaign
        * Today Marker, Calendar type and Locations should be completed from the "Manage Campaign"
            * Players could not change, delete or add the previous items
            * Players on the timeline should be a list of the relationships for that specific player and the player itself
            * The only way to add Players to the timeline is by adding relationships
        * DM should be able to see timelines on its campaigns (no matter the user that has created them)

## Manage Campaigns
### General Features
* Create "private" timelines from this module
* "Today Marker" should be a calendar same as in the `timeline`. Select the type of Calendar on Campaing creation and the Marker should display a calendar pop-up to select the date
* Reference already created Timelines (from `timeline` module) into Campaigns

# New Tools
## Journey Path Map for Campaigns
A tool to draw your journey on a map. 

### General Features
* A tool for DM
* Set a Map as background
* Use the cities/locations from the Campaign
* Define Groups/NPCs to track (in addition to the Players)
* Define a matrix of distances between cities/locations
* Display the direct paths with the distance and time in hours (walking, flying and by horse) between points
* Allow to draw the paths taken by the Groups/NPCs/Players
* Display the information of the paths


# Others

## General
* Player Profile with read/write for resources created by the player on the assigned campaigns
