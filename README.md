# Gmail Filters via AppScript

* Install CLASP (https://github.com/google/clasp)
  * `npm install -g @google/clasp``
  * Then enable the Google Apps Script API: https://script.google.com/home/usersettings ![alt](https://user-images.githubusercontent.com/744973/54870967-a9135780-4d6a-11e9-991c-9f57a508bdf0.gif)
* Create a new project
  * clasp create [--title <title>] [--type <type>]
  * clone this repo
* push the source to the new project
  * clasp push
* create a time-based trigger
  * e.g. every 5min 
  * on the main() function
