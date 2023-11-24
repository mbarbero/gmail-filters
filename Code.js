/**
 * AbstractGMailFilter is an abstract class that provides a base for creating Gmail filters.
 */
class AbstractGMailFilter {
  
  /**
   * @param {string} searchQuery - The query to use when searching for Gmail threads.
   * @param {number} [searchMax=16] - The maximum number of threads to return from the search.
   */
  constructor(searchQuery, searchMax = 16) {
    this.searchQuery = searchQuery;
    this.searchMax = searchMax;
  }

  /**
   * Abstract method that should be implemented by subclasses. 
   * It should return an array of labels for a given thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @throws {Error} If the method is not implemented by a subclass.
   */
  findLabels(thread) {
    throw new Error("You have to implement the method findLabels!");
  }

  /**
   * Determines if a message is important (ie if it should be moved to the inbox and marked as important).
   * @param {GmailMessage} m - The message to check.
   * @returns {boolean} - Returns false by default. This method can be overridden by subclasses to provide custom logic.
   */
  isImportantMessage(m) {
    return false;
  }

  /**
   * Takes an array of labels and returns a new array with duplicate labels removed.
   * @param {GmailLabel[]} labels - The array of labels to filter.
   * @returns {GmailLabel[]} - The filtered array of labels.
   * @private
   */
  _uniqLabels(labels) {
    return labels.filter((current, index, self) =>
        current && self.findIndex(label => label && label.getName() === current.getName()) === index
    );
  }

  /**
   * Takes a string and returns a Gmail label. If the label does not exist, it is created.
   * @param {string} labelStr - The name of the label to get or create.
   * @returns {GmailLabel} - The existing or newly created label.
   * @private
   */
  _getOrCreateLabel(labelStr) {
    const sanitizedLabelStr = labelStr.replace(/\(|\)/g, "_");
    let label = GmailApp.getUserLabelByName(sanitizedLabelStr);
    if (!label) {
      try {
        label = GmailApp.createLabel(sanitizedLabelStr);
      } catch (e) {
        console.error(`Error while creating label "${sanitizedLabelStr}"`, e);
        throw e;
      }
    }
    return label;
  }
  
  /**
   * Takes a string representing a hierarchy of labels (separated by "/") and returns a Gmail label. 
   * If any labels in the hierarchy do not exist, they are created.
   * @param {string} labelName - The string representing the hierarchy of labels.
   * @param {string} [separator="/"] - The separator used to split the labelName into an array of labels.
   * @returns {GmailLabel} - The existing or newly created label.
   * @private
   */
  _getOrCreateLabelHierarchy(labelName, separator = "/") {
    const labels = labelName.split(separator);
    return labels.reduce((currentLabel, label) => {
        if (currentLabel) {
            return this._getOrCreateLabel(`${currentLabel.getName()}/${label}`);
        } else {
            return this._getOrCreateLabel(label);
        }
    }, null);
  }

  /**
   * Searches for Gmail threads based on the `searchQuery` and applies labels to the threads. If a thread 
   * contains an important message (as determined by `isImportantMessage`), the thread is marked as 
   * important and moved to the inbox. Otherwise, the thread is marked as unimportant and moved to the archive.
   */
  run() {
    GmailApp.search(this.searchQuery, 0, this.searchMax).map(thread => {
      const labels = this._uniqLabels(this.findLabels(thread));
      
      if (labels.length == 0) {
        console.error(`No labels found for thread "${thread.getFirstMessageSubject()}" (id="${thread.getId()}")`);
        return;
      }
      
      labels.map(label => {
        thread.addLabel(label);
        console.info(`Label "${label.getName()}" has been added to thread "${thread.getFirstMessageSubject()}" (id="${thread.getId()}")`);
      });
      
      if (thread.getMessages().some(this.isImportantMessage)) {
        console.info(`Important thread "${thread.getFirstMessageSubject()}" (id="${thread.getId()}")`);
        thread.markImportant();
        thread.moveToInbox();
      } else {
        thread.markUnimportant();
        thread.moveToArchive();
      }
    });
  }
}

/**
 * MailmanFilter is a class that extends AbstractGMailFilter for creating Gmail filters specifically for mailing lists.
 * @extends AbstractGMailFilter
 */
class MailmanFilter extends AbstractGMailFilter {

  /**
   * @param {number} [searchMax=16] - The maximum number of threads to return from the search.
   */
  constructor(searchMax = 16) {
    super('from:*@eclipse.org' +
      ' AND NOT from:gitlab@gitlab.eclipse.org' +
      ' AND NOT from:gerrit@eclipse.org' +
      ' AND NOT from:gerrit@foundation.eclipse.org' +
      ' AND NOT from:hudson@eclipse.org' +
      ' AND NOT from:webmaster@eclipse.org' +
      ' AND NOT from:sabot@*' +
      ' AND NOT in:Sent' +
      ' AND after:2019/01/01 ' +
      ' AND has:nouserlabels', searchMax);
  }

  /**
   * Returns an array of labels for a given thread. The labels are determined based on the sender and content of 
   * the messages in the thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @returns {GmailLabel[]} - The array of labels for the thread.
   */
  findLabels(thread) {
    return thread.getMessages().map(m => {
      const rawContent = m.getRawContent();
      const listId = rawContent.match(/^List-ID: [^<]*<([^>]*)\.eclipse\.org>/mi)?.[1]?.trim();
      const root = 'Eclipse Lists';
  
      if (listId) {
        return this._getOrCreateLabelHierarchy(`${root}/${listId}`);
      }
  
      const isHubspot = rawContent.match(/^X-Report-Abuse-To:(.*hubspot.*)/mi)?.[1];
      const isMailChimp = rawContent.match(/^X-Mailer: *(.*mailchimp.*)/mi)?.[1];
      const isJenkins = rawContent.match(/^X-Jenkins-Result: *(.*)/mi)?.[1];
      const isGCal = rawContent.match(/^Sender:[^<]*<(calendar-notification@google.com)>.*/mi)?.[1];

      if (!isHubspot && !isMailChimp && !isJenkins && !isGCal) {
        console.warn(`Message not from HubSpot, nor MailChimp, nor Jenkins, not Google Calendar "${m.getSubject()}" on ${m.getDate()} from ${m.getFrom()}`);
        return null;
      }
  
      const fromName = rawContent.match(/^From: *[^<]*<([^@]*)@eclipse(-foundation)?\.org>/mi)?.[1]?.trim();
      if (!fromName) {
        console.warn(`Uknown sender of message "${m.getSubject()}" on ${m.getDate()}`);
        return null;
      }
  
      return this._getOrCreateLabelHierarchy(`${root}/HubSpot Lists/${fromName}`);
    });
  }
}

/**
   * Returns an array of labels for a given thread. The labels are determined based on the sender and content of the messages in the thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @returns {GmailLabel[]} - The array of labels for the thread.
   */
class GitHubFilter extends AbstractGMailFilter {

  /**
   * @param {number} [searchMax=16] - The maximum number of threads to return from the search.
   */
  constructor(searchMax = 16) {
    super('from:notifications@github.com AND has:nouserlabels', searchMax);
  }

  /**
   * Determines if a GitHub notification message is important based on the X-GitHub-Reason header.
   * @param {GmailMessage} m - The message to check.
   * @returns {boolean} - Returns true if the X-GitHub-Reason is not one of 'subscribed', 'team_mention', or 'ci_activity'.
   */
  isImportantMessage(m) {
    const unimportantReasons = new Set(['subscribed', 'team_mention', 'ci_activity']);
    const ghReason = m.getRawContent().match(/^X-GitHub-Reason: (.*)/mi)?.[1]?.trim();
    return ghReason && !unimportantReasons.has(ghReason);
  }

  /**
   * Returns an array of labels for a given thread. The labels are determined based on the 
   * List-ID header of the messages in the thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @returns {GmailLabel[]} - The array of labels for the thread.
   */
  findLabels(thread) {
    return thread.getMessages().map(m => {
      const rawContent = m.getRawContent();
      const listId = rawContent.match(/^List-ID: ([^<]*) <[^>]*>.*/mi);
      if (!listId || listId.length <= 1) {
        console.warn(`Cannot find List-ID from message "${m.getSubject()}" on ${m.getDate()}`);
        return null;
      }
  
      const orgMatch = listId[1].match('([^/]*)/.*');
      const repoMatch = listId[1].match('[^/]*/(.*)');
      if (!orgMatch || !repoMatch || orgMatch.length <= 1 || repoMatch.length <= 1) {
        console.error(`Something went wrong during matching of "${listId[1]}"`);
        return null;
      }
  
      const root = "GitHub";
      const org = orgMatch[1] ? orgMatch[1].trim().replace(/_/g, ' ') : "unknown_org";
      const repo = repoMatch[1] ? repoMatch[1].trim().replace(/_/g, ' ') : "unknown_repo";
  
      return this._getOrCreateLabelHierarchy(`${root}/${org}/${repo}`);
    });
  }
}

/**
 * GitLabFilter is a class that extends AbstractGMailFilter for creating Gmail filters specifically 
 * for GitLab notifications.
 * @extends AbstractGMailFilter
 */
class GitLabFilter extends AbstractGMailFilter {
  
  /**
   * @param {number} [searchMax=16] - The maximum number of threads to return from the search.
   */
  constructor(searchMax = 16) {
    super('from:gitlab@gitlab.eclipse.org AND has:nouserlabels', searchMax);
  }

  /**
   * Returns an array of labels for a given thread. The labels are determined based on the X-GitLab-Project-Path 
   * header of the messages in the thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @returns {GmailLabel[]} - The array of labels for the thread.
   */
  findLabels(thread) {
    return thread.getMessages().map(m => {
      const rawContent = m.getRawContent();
      const projectPath = rawContent.match(/^X-GitLab-Project-Path: *(.*)/mi)?.[1]?.split('/');
  
      const rootLabel = "gitlab.eclipse.org";
      
      if (projectPath) {
        const projectLabel = projectPath.reduce((acc, pathElement) => {
          if (pathElement?.trim()?.length > 1) {
            return `${acc}/${pathElement.trim()}`;
          }
          return acc;
        }, rootLabel);
  
        return this._getOrCreateLabelHierarchy(projectLabel);
      } else {
        return this._getOrCreateLabelHierarchy(rootLabel);
      }
    });
  }
}

/**
 * BugzillaFilter is a class that extends AbstractGMailFilter for creating Gmail filters specifically for Bugzilla notifications.
 * @extends AbstractGMailFilter
 */
class BugzillaFilter extends AbstractGMailFilter {

  /**
   * @param {number} [searchMax=16] - The maximum number of threads to return from the search.
   */
  constructor(searchMax = 16) {
    super('(from:bugzilla-daemon@polarsys.org' +
      ' OR from:bugzilla-daemon@eclipse.org' +
      ' OR bugzilla-daemon@locationtech.org)' +
      ' AND has:nouserlabels', searchMax);
  }

  /**
   * Determines if a Bugzilla notification message is important based on the X-Bugzilla-Reason header.
   * @param {GmailMessage} m - The message to check.
   * @returns {boolean} - Returns true if the X-Bugzilla-Reason is not 'None'.
   */
  isImportantMessage(m) {
    var bzReason = m.getRawContent().match(/^X-Bugzilla-Reason: (=\\?UTF-8\\?Q\\?)?([^?\n]*)(\\?=)?/mi);
    if (bzReason != null && bzReason.length > 1 && bzReason[2].trim() != 'None') {
      return true;
    }
    return false;
  }

  /**
   * Returns the root label for a given Bugzilla URL.
   * @param {string} url - The Bugzilla URL to get the root label for.
   * @returns {string} - The root label for the URL.
   */
  _getRootLabel(url) {
    const rootLabels = {
      "bugs.eclipse.org": "Eclipse Bugs",
      "polarsys.org": "Polarsys Bugs",
      "locationtech.org": "LocationTech Bugs",
      "foundation=2Eeclipse=2Eorg": "Foundation Bugs",
      "foundation.eclipse.org": "Foundation Bugs"
    };
    const key = Object.keys(rootLabels).find(key => url.includes(key));
  
    if (key) {
      return rootLabels[key];
    }
    
    return "Unknown Bugzilla";
  }
  
  /**
   * Processes a match result from a regular expression match.
   * @param {Array} match - The match result from a regular expression match.
   * @returns {string|null} - The processed match result, or null if the match result is not valid.
   */
  _processMatch(match) {
    if (match && match.length > 1) {
      const result = match[2].trim();
      if (match[1] != null) {
        return result.replace(/_/g, ' ');
      }
      return result;
    }
    return null;
  }
  
  /**
   * Returns an array of labels for a given thread. The labels are determined based on the X-Bugzilla-URL, X-Bugzilla-Product, and X-Bugzilla-Component headers of the messages in the thread.
   * @param {GmailThread} thread - The Gmail thread to find labels for.
   * @returns {GmailLabel[]} - The array of labels for the thread.
   */
  findLabels(thread) {
    return thread.getMessages().map(m => {
      const rawContent = m.getRawContent();
      const url = rawContent.match(/^X-Bugzilla-URL: (.*)/mi);
      if (!url) {
        throw new Error(`Bugzilla URL match failed for message "${m.getSubject()}" on ${m.getDate()}`);
      }

      const productMatch = rawContent.match(/^X-Bugzilla-Product: (=\\?UTF-8\\?Q\\?)?([^?\n]*)(\\?=)?/mi);
      const componentMatch = rawContent.match(/^X-Bugzilla-Component: (=\\?UTF-8\\?Q\\?)?([^?\n]*)(\\?=)?/mi);
  
      const root = this._getRootLabel(url[1]);
      const product = this._processMatch(productMatch);
      const component = this._processMatch(componentMatch);
  
      if (product && component) {
        return this._getOrCreateLabelHierarchy(`${root}/${product}/${component}`);
      } else {
        console.warn(`Something went wrong during matching of "${productMatch}" and "${componentMatch}"`);
        return this._getOrCreateLabelHierarchy(root);
      }
    });
  }
}

/**
 * The main function that runs the Gmail filters.
 * It creates instances of GitHubFilter, GitLabFilter, BugzillaFilter, and MailmanFilter and runs them.
 * The MailmanFilter is run with a maximum of 32 threads to return from the search.
 */
function main() {
  new GitHubFilter().run();
  new GitLabFilter().run(); 
  new BugzillaFilter().run();
  new MailmanFilter().run();
}
