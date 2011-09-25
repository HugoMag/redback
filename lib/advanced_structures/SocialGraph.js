/*!
 * Redback
 * Copyright(c) 2011 Chris O'Hara <cohara87@gmail.com>
 * MIT Licensed
 */

/**
 * Module dependencies.
 */

var Structure = require('../Structure'),
    _ = require("underscore");

/**
 * Build a social graph similar to Twitter's. User ID can be a string or
 * integer, as long as they're unique.
 *
 * Usage:
 *    `redback.createSocialGraph(id [, prefix]);`
 *
 * Reference:
 *    http://redis.io/topics/data-types#sets
 *
 * Redis Structure:
 *    `(namespace:)(prefix:)id:following = set(ids)`
 *    `(namespace:)(prefix:)id:followers = set(ids)`
 */

var SocialGraph = exports.SocialGraph = Structure.new();

/**
 * Initialise the SocialGraph.
 *
 * @param {string} prefix (optional)
 * @api private
 */

SocialGraph.prototype.init = function (prefix) {
    this.key_prefix = this.namespaceKey();
    if (prefix) {
        this.key_prefix += prefix + ':';
    }
    this.key = this.key_prefix + this.id;
    this.following = this.key + ':following';
    this.followers = this.key + ':followers';
}

/**
 * Follow one or more users.
 *
 * @param {int|SocialGraph|Array} user(s)
 * @param {Function} callback (optional)
 * @return this
 * @api public
 */

SocialGraph.prototype.follow = function (users, callback) {
    var self = this,
        users = this.getKeys(arguments, 'id'),
        multi = this.client.multi();
    if (typeof users[users.length-1] === 'function') {
        callback = users.pop();
    } else {
        callback = function () {};
    }
    users.forEach(function (user) {
        multi.sadd(self.key_prefix + user + ':followers', self.id);
        multi.sadd(self.following, user);
    });
    multi.exec(callback);
    return this;
}

/**
 * Unfollow one or more users.
 *
 * @param {int|SocialGraph|Array} user(s)
 * @param {Function} callback (optional)
 * @return this
 * @api public
 */

SocialGraph.prototype.unfollow = function (users, callback) {
    var self = this,
        users = this.getKeys(arguments, 'id'),
        multi = this.client.multi();
    if (typeof users[users.length-1] === 'function') {
        callback = users.pop();
    } else {
        callback = function () {};
    }
    users.forEach(function (user) {
        multi.srem(self.key_prefix + user + ':followers', self.id);
        multi.srem(self.following, user);
    });
    multi.exec(callback);
    return this;
}

/**
 * Gets the users whom the current users follows as an array.
 *
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getFollowing = function (callback) {
    this.client.smembers(this.following, callback);
    return this;
}

/**
 * Gets an array of users who follow the current user.
 *
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getFollowers = function (callback) {
    this.client.smembers(this.followers, callback);
    return this;
}

/**
 * Count how many users the current user follows.
 *
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.countFollowing = function (callback) {
    this.client.scard(this.following, callback);
    return this;
}

/**
 * Count how many users follow the current user.
 *
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.countFollowers = function (callback) {
    this.client.scard(this.followers, callback);
    return this;
}

/**
 * Checks whether the current user follows the specified user.
 *
 * @param {string|SocialGraph} user
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.isFollowing = function (user, callback) {
    user = this.getKey(user, 'id');
    this.client.sismember(this.following, user, callback);
    return this;
}

/**
 * Checks whether the specified user follows the current user.
 *
 * @param {string|SocialGraph} user
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.hasFollower = function (user, callback) {
    user = this.getKey(user, 'id');
    this.client.sismember(this.followers, user, callback);
    return this;
}

/**
 * Gets an array of common followers for one or more users.
 *
 * @param {string|SocialGraph|Array} user(s)
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getCommonFollowers = function (users, callback) {
    var users = this.getSocialKeys(arguments, 'followers');
    users.unshift(this.followers);
    this.client.sinter.apply(this.client, users);
    return this;
}

/**
 * Gets an array of users who are followed by all of the specified user(s).
 *
 * @param {string|SocialGraph|Array} user(s)
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getCommonFollowing = function (users, callback) {
    var users = this.getSocialKeys(arguments, 'following');
    users.unshift(this.following);
    this.client.sinter.apply(this.client, users);
    return this;
}

/**
 * Gets an array of users who follow the current user but do not follow any
 * of the other specified users.
 *
 * @param {string|SocialGraph|Array} user(s)
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getDifferentFollowers = function (users, callback) {
    var users = this.getSocialKeys(arguments, 'followers');
    users.unshift(this.followers);
    this.client.sdiff.apply(this.client, users);
    return this;
}

/**
 * Gets an array of users who are followed by the current user but not any of
 * the other specified users.
 *
 * @param {string|SocialGraph|Array} user(s)
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getDifferentFollowing = function (users, callback) {
    var users = this.getSocialKeys(arguments, 'following');
    users.unshift(this.following);
    this.client.sdiff.apply(this.client, users);
    return this;
}

/**
 * Gets an random number of users who follow the current user.
 *
 * @param {int} number of random users to fetch.
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getRandomFollowers = function (random_size, callback) {
    var self = this;
    
    self.countFollowers(function (err, size) {
        if(size < random_size) {
            self.getFollowers(callback);
        } else {
            var multi = self.client.multi(),
                random_elements = [],
                call_index = 0,
                key = self.followers;
            self.getRandomElements(multi, key, random_elements, random_size, size, call_index, callback);
        }
    });
    return this;
}

/**
 * Gets an random number of users who follow the current user.
 *
 * @param {int} number of random users to fetch.
 * @param {Function} callback
 * @return this
 * @api public
 */

SocialGraph.prototype.getRandomFollowing = function (random_size, callback) {
    var self = this;
    
    self.countFollowing(function (err, size) {
        if(size < random_size) {
            self.getFollowing(callback);
        } else {
            var multi = self.client.multi(),
                random_elements = [],
                call_index = 0,
                key = self.following;
            self.getRandomElements(multi, key, random_elements, random_size, size, call_index, callback);
        }
    });
    return this;
}

/**
 * Gets an random number of members in a set.
 *
 * @param {Multi} multi object.
 * @param {String} set key.
 * @param {int} number of random elements to fetch.
 * @param {int} call number.
 * @param {Function} callback
 * @return this
 * @api public
 */
SocialGraph.prototype.getRandomElements = function(multi, key, random_elements, random_size, size, call_index, callback) {
    
    var self = this;
    
    self.executeMultiRandomCalls(multi, random_size, key, function(err, values) {
        random_elements = _.union(random_elements, values);
        // already have all the needed elements.
        if(random_elements.length >= random_size) {
            // truncate array if needed.
            if(random_elements.length > random_size) {
                random_elements = _.first(random_elements, random_size);
            } 
            // send elements.
            callback(null, random_elements);
        } 
        // could not get all needed random elements
        // so send to ones we have.
        else if(random_calls.length <= random_size && call_index < size) {
            callback(null, random_elements);
        } 
        // get more random elements. 
        else {
            call_index++;
            self.getRandomElements(multi, key, random_elements, random_size, size, call_index, callback);
        }
    });
}

/**
 * Execute several random calls to a set.
 *
 * @param {Function} callback
 * @return this
 * @api private
 */

SocialGraph.prototype.executeMultiRandomCalls = function(multi, random_size, key, callback) {
    var index = 0;
    while (index <= random_size * 2) {
        multi.srandmember(key);
        index++;
    }
    multi.exec(function(err, values) {
        values = _.uniq(values);
        callback(null, values);
    });
}

/**
 * Grabs the specified SocialGraph key from a list of arguments.
 *
 * @param {Array} args
 * @param {string} key
 * @return {string} social_keys
 * @api private
 */

SocialGraph.prototype.getSocialKeys = function (args, key) {
    var users = Array.prototype.slice.call(args),
        callback = users.pop(),
        user_key,
        self = this,
        keys = [];

    for (var i = 0, l = users.length; i < l; i++) {
        if (Array.isArray(users[i])) {
            users[i].forEach(function (user) {
                if (typeof user[key] !== 'undefined') {
                    user_key = user[key];
                } else {
                    user_key = self.key_prefix + user + ':' + key;
                }
                keys.push(user_key);
            });
        } else {
            if (typeof users[i][key] !== 'undefined') {
                user_key = users[i][key];
            } else {
                user_key = self.key_prefix + users[i] + ':' + key;
            }
            keys.push(user_key);
        }
    }
    keys.push(callback);
    return keys;
}
