var Discord = require("discord.js");
var JSONFile = require("jsonfile");
var schedule = require("node-schedule");
var util = require('util');

var bot = new Discord.Client();
var config = require("./config.json")

var _ = require('lodash');


/*
	Notifications for mods

function nightly () {
	var user_embed = new Discord.RichEmbed()
	JSONFile.readFile(config.casefile, function(err, caseData) {			
		
		var opens = caseData.outstanding.toString();
		if (opens == "") {
			opens = "None";
		}
		
		console.log("Notifying server owner of open cases: " + opens)
		user_embed.setAuthor("Open Cases:");
		user_embed.setDescription(opens)
		
		bot.channels.get(config.inbox).send(config.pingee,{embed: user_embed})
	});
}

var nightly_notif = schedule.scheduleJob("0 1 * * *", nightly);
*/

function weekly () {
	var user_embed = new Discord.RichEmbed()

	console.log("Modmeeting")
	user_embed.setAuthor("Weekly Mod Meeting " + (new Date).toISOString().replace("T", " ").substr(0, 19));
	
	var agenda = []
	
	for (var i = 1; i < config.agenda.length+1; i++) {
		agenda.push(i + ": " + config.agenda[i-1])
	}
	
	if (agenda.length == 0) {
		user_embed.setAuthor("No Agenda Set")		
	} else {	
		user_embed.setDescription(agenda.join("\n"))
	}
	
	bot.channels.get(config.meetingroom).send(""+config.mods,{embed: user_embed})
}

var weekly_meeting = schedule.scheduleJob("0 23 * * 0", weekly);
var weekly_meeting2 = schedule.scheduleJob("0 11 * * 0", weekly);

function write_config () {
	JSONFile.writeFile("config.json", config, function (err) {
			if (err) { console.error("Error in write_config: " + err) }
	})
}

/*
	Bot startup
*/
bot.on("ready", () => {
	for (let [id, g] of bot.guilds) {
		g.fetchMembers()
	}
	console.log("Ready and listening.");
	bot.user.setPresence({ game: { name: "PM for anon modmail", type: 1, url: "https://github.com/xommified/SolemnScolding"} });
});


/*
	Assign permissions for voice channels
*/
bot.on("voiceStateUpdate", (oldMember, newMember) => {
	
	console.log("updating voice chat perms")
	
	if (oldMember.voiceChannelID != newMember.voiceChannelID) {

		if (oldMember.voiceChannelID in config.channelmap) {
			bot.channels.get(config.channelmap[oldMember.voiceChannelID]).permissionOverwrites.get(newMember.id).delete()
			console.log(newMember.user.username + " left " + oldMember.voiceChannelID)
		}
		
		if (newMember.voiceChannelID in config.channelmap) {
			bot.channels.get(config.channelmap[newMember.voiceChannelID]).overwritePermissions(newMember, {READ_MESSAGES: true})
			console.log(newMember.user.username + " entered " + newMember.voiceChannelID)
		}
	}
});


/*
	Handle incoming modmails from users
*/
function incomingModmail(message, inbox) {
	// Messages coming in from a DM channel are from users

	// If the message has no prefix, treat it as a new conversation
	//console.log("Message from user: " + message.author.username + " (" + message.author + "): " + message.content)
	console.log("Message from user: (" + message.author + "): "  + message.content)
	
	processedMessage = {
		author: {
			username: message.author.username,
			discriminator: message.author.discriminator,
			id: message.author.id
		},
		channel: message.channel.id,
		id: message.id,
		content: message.content,
		inboxID: 0
	}
	
	JSONFile.readFile(config.casefile, function(err, caseData) {
		
		//Retreive the case number, save the message, increment the case number, and add it to the list of outstanding cases
		casenum = caseData.nextnum
		delete message.embeds
		caseData.cases[casenum] = processedMessage
		caseData.nextnum = casenum + 1			
		caseData.outstanding.push(casenum)
		
		//messageResult = 0

		//Send the message to the inbox
		var mod_embed = new Discord.RichEmbed()	
		mod_embed.setAuthor("Message #" + casenum)
		mod_embed.setDescription(message.content)
		if(message.attachments != null) {
			for (a of message.attachments.values()) {
				mod_embed.setImage(a.proxyURL)
			}
		}
		inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
			.then(messageResult => {
				caseData.cases[casenum].inboxID = messageResult.id
				//console.log(messageResult.id)

				//Save the data
				JSONFile.writeFile(config.casefile, caseData, function (err) {
					if (err) { console.error("Error in incomingModmail: " + err) }
				})
			})

		//Send user a delivery confirmation
		var user_embed = new Discord.RichEmbed()
		user_embed.setAuthor("Message sent, your case number is: " + casenum)
		user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+config.prefix+casenum+": Your reply goes here.`\n")
		message.channel.send("",{embed: user_embed, disableEveryone: true})

	});
}


/*
	Handle incoming replies from users
*/
function incomingReply(message, inbox, replyregex) {

	if (message.content.match(replyregex)) {	
		//Response to case
		console.log("Response from user: (" + message.author + "): "  + message.content)
		
		processedMessage = {
			author: {
				username: message.author.username,
				discriminator: message.author.discriminator,
				id: message.author.id
			},
			channel: message.channel.id,
			id: message.id,
			content: message.content,
			inboxID: 0  
		}

		JSONFile.readFile(config.casefile, function(err, caseData) {
			
			//Split up message
			replycasenum = message.content.slice(config.prefix.length, message.content.indexOf(":"))
			newcasenum = caseData.nextnum
			answer = message.content.slice(message.content.indexOf(":")+1)
			
			//Users should only be able to reply to their owned case numbers
			if (caseData.cases[replycasenum].author.id == message.author.id) {
				
				//Save the message, increment the case number, add it to the list of outstanding cases
				caseData.cases[newcasenum] = processedMessage
				caseData.nextnum = newcasenum + 1
				caseData.outstanding.push(newcasenum)
				
				//Send the message to the inbox
				var mod_embed = new Discord.RichEmbed()
				mod_embed.setAuthor("Message #"+newcasenum+" in Reply to Message #" + replycasenum)
				mod_embed.setDescription(answer)		
				if(message.attachments != null) {
					for (a of message.attachments.values()) {
						mod_embed.setImage(a.proxyURL)
					}
				}
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					.then(messageResult => {
						caseData.cases[casenum].inboxID = messageResult.id
						//console.log(messageResult.id)

						//Save the data
						JSONFile.writeFile(config.casefile, caseData, function (err) {
							if (err) { console.error("Error in incomingModmail: " + err) }
						})
					})

				//Send user a delivery confirmation
				var user_embed = new Discord.RichEmbed()
				user_embed.setAuthor("Message sent, your new case number is: " + newcasenum)
				user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+config.prefix+newcasenum+": Your reply goes here.`\n")
				message.channel.send("",{embed: user_embed, disableEveryone: true})

			} else {
				message.reply("You cannot respond to a case number that does not belong to you. Please double check the number and try again.")
			}
		});
	
	} else {
		message.reply("Check your syntax and try again.")
	}
}


/*
	Display cases upon moderator request
*/
function displayCases(inbox) {

	console.log("Displaying open cases")
			
	JSONFile.readFile(config.casefile, function(err, caseData) {			
	
		var mod_embed = new Discord.RichEmbed()	
		var opens = caseData.outstanding.toString()
		if (opens == "") {
			mod_embed.setAuthor("No Open Cases")		
		} else {
			mod_embed.setAuthor("Open Cases:")		
			mod_embed.setDescription(opens)
		}
		inbox.send("",{embed: mod_embed, disableEveryone: true})
		
	});
}


/*
	Display blocked users upon moderator request
*/
function displayBlockedUsers(inbox) {

	console.log("Displaying blocked users")
			
	var mod_embed = new Discord.RichEmbed()	
	var blocked = []
	for (blockee of config.blacklist) {
		blocked.push("<@"+blockee+">")
	}
	if (blocked.length == 0) {
		mod_embed.setAuthor("No Blocked Users")		
	} else {
		mod_embed.setAuthor("Blocked Users:")		
		mod_embed.setDescription(blocked.join("\n"))
	}
	inbox.send("",{embed: mod_embed, disableEveryone: true})
}


/*
	Block a user from sending modmails
*/
function blockUser(message, inbox) {
	
	tokens = message.content.split(" ")

	if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
		message.reply("Usage: `"+config.prefix+"block 1234567890`")
	} else {
	
		console.log("Blocking user")
		
		var mod_embed = new Discord.RichEmbed()	
		
		config.blacklist.push(tokens[1])
		
		mod_embed.setAuthor("User Blocked")		
		mod_embed.setDescription("<@"+tokens[1]+">")
		
		write_config()
		
		inbox.send("",{embed: mod_embed, disableEveryone: true})
	}
}


/*
	Unblock a user from sending modmails
*/
function unblockUser(message, inbox) {

	tokens = message.content.split(" ")

	if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
		message.reply("Usage: `"+config.prefix+"unblock 1234567890`")
	} else {
	
		console.log("Unblocking user")
		
		var mod_embed = new Discord.RichEmbed()	
		var toRemove = config.blacklist.indexOf(tokens[1])
		if (toRemove == -1) {
			mod_embed.setAuthor("No such blocked user")		
		} else {
			config.blacklist.splice(toRemove, 1)
			mod_embed.setAuthor("Unblocked User:")		
			mod_embed.setDescription("<@"+tokens[1]+">")
			write_config()
		}
		inbox.send("",{embed: mod_embed, disableEveryone: true})
	}
}


/*
	Close an open modmail case
*/
function closeCase(message, inbox) {

	tokens = message.content.split(" ")
			
	if (tokens.length != 2) {
		message.reply("Usage: `"+config.prefix+"close 123` or `"+config.prefix+"close 123,456,789` -- (no spaces between cases)")
	} else {
		
		JSONFile.readFile(config.casefile, function(err, caseData) {		
	
			cases = tokens[1].split(",");
			
			closed = []
			notclosed = []
			
			//Check provided numbers
			for (casenumstr of cases) {
	
				casenum = parseInt(casenumstr);
				
				var toRemove = caseData.outstanding.indexOf(casenum);
				if (toRemove > -1) {
					caseData.outstanding.splice(toRemove, 1);
					closed.push(casenum)
					console.log("Closing case #" + casenum)
				} else {
					notclosed.push(casenumstr)
					console.log("Invalid case: " + casenumstr)
				}
			}
			
			//Output results
			if (closed.length > 0) {
				var embed1 = new Discord.RichEmbed()
				embed1.setAuthor("Case(s) Closed: ")
				embed1.setDescription(closed.join(","));
				inbox.send("",{embed: embed1, disableEveryone: true})
			}
			
			if (notclosed.length > 0) {
				var embed2 = new Discord.RichEmbed()
				embed2.setAuthor("Invalid Case(s): ")
				embed2.setDescription(notclosed.join(","));
				inbox.send("",{embed: embed2, disableEveryone: true})
			}
			
			//Save the data
			JSONFile.writeFile(config.casefile, caseData, function (err) {
				if (err) { console.error("Error in closeCase: " + err) }
			})
		});
	}
}


/*
	Compare whether the authors of two modmails are the same user
*/
function compareAuthors(message, inbox) {


	tokens = message.content.split(" ")
	
	if (tokens.length != 3) {
		message.reply("Usage: `"+config.prefix+"compare 1 2`")
	} else {
	
		JSONFile.readFile(config.casefile, function(err, caseData) {			
				
			var mod_embed = new Discord.RichEmbed()
			
			var invalid = []
			if (!(tokens[1] in caseData.cases))
				invalid.push(tokens[1])
			if (!(tokens[2] in caseData.cases))
				invalid.push(tokens[2])
			
			if (invalid.length != 0) {
				mod_embed.setAuthor("Invalid case(s):")
				mod_embed.setDescription(invalid.join(", "))
			} else {
				if (caseData.cases[tokens[1]].author.id == caseData.cases[tokens[2]].author.id) {
					mod_embed.setAuthor("Messages are from the same user")
				} else {
					mod_embed.setAuthor("Messages are not from the same user")
				}
				console.log("Testing cases: " + tokens[1] + " " + tokens[2])
			}
			inbox.send("",{embed: mod_embed, disableEveryone: true})
		});
	}
}


/*
	Send a response from a moderator to an open case and possibly close the case.
*/
function sendResponse(message, inbox) {

	JSONFile.readFile(config.casefile, function(err, caseData) {			
		
		//Retrieve case number and check for close flag
		close = false
		casenum = message.content.slice(config.prefix.length, message.content.indexOf(":"))
		if(casenum.slice(-1) == "c") {
			close = true
			casenum = casenum.slice(0, -1);
		}
		
		answer = message.content.slice(message.content.indexOf(":")+1)
		
		if (answer.replace(/\s+/g, "") == "") {
		
			message.reply("Usage: `"+config.prefix+"123: reply` or `"+config.prefix+"123c: reply and close`")
		} else {
			
			//Forward reply to user
			var user_embed = new Discord.RichEmbed()
			user_embed.setAuthor("Reply to Message #" + casenum + ":")
			user_embed.setDescription(answer)
			user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a reply to this message, reply with: \n`"+config.prefix+casenum+": Your reply goes here.`\n")
			if(message.attachments != null) {
				for (a of message.attachments.values()) {
					user_embed.setImage(a.proxyURL)
				}
			}
			message.guild.members.get(caseData.cases[casenum].author.id).send("",{embed: user_embed, disableEveryone: true})
			
			console.log("Sent reply to " + caseData.cases[casenum].author.id + ", case #" + casenum + "- " + answer)
			
			//Send delivery confirmation to mods
			var mod_embed = new Discord.RichEmbed()
			mod_embed.setAuthor("Reply sent to: ")
			mod_embed.setDescription(casenum)	
			if (close) {
				var toRemove = caseData.outstanding.indexOf(parseInt(casenum));
				if (toRemove > -1) {
					caseData.outstanding.splice(toRemove, 1);
					mod_embed.setAuthor("Message delivered, case closed: " + casenum)
					
				} else {
					mod_embed.setAuthor("Message delivered, case already closed: " + casenum)
				}
			}	
			inbox.send("",{embed: mod_embed, disableEveryone: true})
			
			//Write the data
			JSONFile.writeFile(config.casefile, caseData, function (err) {
				console.error(err)
			})
		}
	});

}

function recall(message, inbox){
	//get case number from message
	tokens = message.content.split(" ")
	casenumstr = tokens[1]

	JSONFile.readFile(config.casefile, function(err, caseData) {		
		//message.guild.members.get(caseData.cases[casenum].author.id).send("",{embed: user_embed, disableEveryone: true})

		//Check if the case number exists in records
		if (casenumstr in caseData.cases) {
			
			//convert casenum into a valid index, then get matching message
			casenum = parseInt(casenumstr)
			targetMessage = caseData.cases[casenum].content
			targetMessageID = caseData.cases[casenum].inboxID
			targetMessageLink = "https://discordapp.com/channels/132566085638553600/470344591049097236/" + targetMessageID 

			//Send the message to the inbox
			var mod_embed = new Discord.RichEmbed()	
			mod_embed.setAuthor("Recalling Message #" + casenum)
			console.log(targetMessageID)
			if (targetMessageID === undefined){
				console.log(targetMessageID + " success")
				mod_embed.setDescription(targetMessage)
			}
			else {
				console.log(targetMessageID + " failure")
				mod_embed.setDescription(targetMessage + "\n [Link to Message](" + targetMessageLink + ")")
			}
			/*if(message.attachments != null) {
				for (a of message.attachments.values()) {
					mod_embed.setImage(a.proxyURL)
				}
			}*/
			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})

		} else {
			var mod_embed = new Discord.RichEmbed()	
			mod_embed.setAuthor("Invalid Case Number")
			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
		}
	});
}


/*
	Lists the agenda in the channel the message was sent from, if the message is sent in a mod channel. (external logic)
*/
function listAgenda(message){

	console.log("Listing agenda")
			
	var mod_embed = new Discord.RichEmbed()	
	var agenda = []
	
	for (var i = 1; i <= config.agenda.length; i++) {
		agenda.push(i + ": " + config.agenda[i-1])
	}
	
	if (agenda.length == 0) {
		mod_embed.setAuthor("No Agenda Set")		
	} else {
		mod_embed.setAuthor("Agenda Items:")		
		mod_embed.setDescription(agenda.join("\n"))
	}
	message.channel.send("",{embed: mod_embed, disableEveryone: true})
}


/*
	Adds an item to the agenda, if the command is sent in a mod channel. (external logic)
*/
function addToAgenda(message){

	item = message.content.slice(message.content.indexOf(" ")+1)

	if (item.length < 3) {
		message.reply("Usage: `"+config.prefix+"addagenda atleast3chars`")
	} else {
	
		console.log("adding agenda")
		
		var mod_embed = new Discord.RichEmbed()	
		
		num = config.agenda.push(item)
		
		mod_embed.setAuthor("Agenda Item added")		
		mod_embed.setDescription(num + ": " + item)
		
		write_config()
		
		message.channel.send("",{embed: mod_embed, disableEveryone: true})
	}
}


/*
	Deletes an item from the agenda, if the command is sent in a mod channel. (external logic)
*/
function deleteFromAgenda(message){

	tokens = message.content.split(" ")

	if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
		message.reply("Usage: `"+config.prefix+"delagenda 1`")
	} else {
		var toRemove = tokens[1]-1
		
		console.log("deleting agenda item " + tokens[1])
		
		var mod_embed = new Discord.RichEmbed()	
		if (toRemove <= 0 || toRemove >= config.agenda.length) {
			mod_embed.setAuthor("No such agenda item")		
		} else {
			removed = config.agenda.splice(toRemove, 1)
			mod_embed.setAuthor("Deleted agenda item:")		
			mod_embed.setDescription(tokens[1]+": "+removed[0])
			write_config()
		}
		message.channel.send("",{embed: mod_embed, disableEveryone: true})
	}
}


/*
**************************************************************************************
**************************************************************************************
**************************************************************************************
*/


/*
	Check a user's post removals on the subreddit. 
*/
function checkUserRemovals(sentFrom, user){

	JSONFile.readFile(config.redditinf, function(err, inf) {
		
		if (user in inf) {
			new_off = inf[user]["current"]
			old_off = inf[user]["prior"]
			num_warn = inf[user]["warned"][0]
			last_warn = inf[user]["warned"][1]
			
			desc = "Removals since last warning: " + new_off + "\nRemovals prior to last warning: " + old_off + "\nNumber of warnings: " + num_warn
			
			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was: Never"
			if (last_warn != 0) {
				timestamp = "Last warning was UTC: " + (new Date(last_warn*1000).toISOString().replace("T", " ").substr(0, 19))
			}
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			mod_embed.setAuthor(user)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})
		} else {
			sentFrom.send("User has no prior removals on record.")
		}
	});
}

function warnUser(sentFrom, user){

	JSONFile.readFile(config.redditinf, function(err, inf) {
		
		if (user in inf) {
			new_off = inf[user]["current"]
			old_off = inf[user]["prior"]
			combined = new_off + old_off
			num_warn = inf[user]["warned"][0]
			last_warn = inf[user]["warned"][1]
			
			inf[user]["current"] = 0
			inf[user]["prior"] = combined
			inf[user]["warned"][0] += 1
			new_warn = Math.floor((new Date).getTime()/1000)
			inf[user]["warned"][1] = new_warn
			
			JSONFile.writeFile(config.redditinf, inf, function (err) {
				if (err) { console.error("Error: " + err) }
			})
			
			desc = "Removals since last warning: " + new_off + " -> 0\nRemovals prior to last warning: " + old_off + " -> " + combined + "\nNumber of warnings: " + num_warn + " -> " + (num_warn+1)
			
			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was UTC: " + (new Date(new_warn*1000).toISOString().replace("T", " ").substr(0, 19))
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			mod_embed.setAuthor(user)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})
		} else {
			sentFrom.send("Cannot warn a user with no prior removals.")
		}
	});
	//}	
}

function listCurrent(sentFrom){

	JSONFile.readFile(config.redditinf, function(err, inf) {

		var baddies = _.chain(inf).filter(n => n.current >= 3).orderBy("current", "desc").map(n => n.current + ": " + n.user).value().join("\n")
		
		console.log(baddies);
		if (baddies == "") {
			sentFrom.send("No users with 3 or more current removals.")
		} else {
			sentFrom.send("Listing users with 3 or more current removals:\n```" + baddies + "```")
		}
	}); 
}

function listCurrentHistory(sentFrom){

	JSONFile.readFile(config.redditinf, function(err, inf) {

		var baddies = _.chain(inf).filter(n => n.current >= 3).orderBy(["current", "prior"], ["desc", "desc"]).map(n => n.prior + "|" + n.current + ": " + n.user).value().join("\n")
		
		console.log(baddies);
		if (baddies == "") {
			sentFrom.send("No users with 3 or more current removals.")
		} else {
			sentFrom.send("Listing users with 3 or more current removals:\n```Prior | Current:\n" + baddies + "```")
		}
	}); 
}

function listAll(sentFrom){
	
	JSONFile.readFile(config.redditinf, function(err, inf) {
		var baddies = _.chain(inf).filter(n => (n.prior + n.current) >= 3).orderBy(["current", "prior"], ["desc", "desc"]).map(n => n.current + "+" + n.prior + ": " + n.user).value().join("\n")
		console.log(baddies);
		sentFrom.send("Listing users with 3 or more total removals (current + prior):\n```" + baddies + "```")
	});
}

/*
	Lists all warnings that have been given by the bot, for all users with warnings. CURRENTLY BROKEN, THE LIST IS TOO LONG FOR A SINGLE DISCORD MESSAGE.
*/

function listWarnings(sentFrom){
		
	JSONFile.readFile(config.redditinf, function(err, inf) {
		var baddies = _.chain(inf).filter(n => n.warned[0] > 0).orderBy(n => n.warned[0], "desc").map(n => n.warned[0] + ": " + n.user).value().join("\n")
		console.log(baddies);
		sentFrom.channel.send("Listing total warnings on record:\n```" + baddies + "```")
		
	});
}

function editWarnings(sentFrom, user, new_warnings){

	JSONFile.readFile(config.redditinf, function(err, inf) {

		if (user in inf) {
			new_off = inf[user]["current"]
			old_off = inf[user]["prior"]
			num_warn = inf[user]["warned"][0]
			last_warn = inf[user]["warned"][1]
			
			inf[user]["warned"][0] = new_warnings
			new_warn = Math.floor((new Date).getTime()/1000)
			inf[user]["warned"][1] = new_warn
			
			JSONFile.writeFile(config.redditinf, inf, function (err) {
				if (err) { console.error("Error: " + err) }
			})

			desc = "Recent removals: " + new_off + " -> " + new_off + "\nPrior removals: " + old_off + " -> " + old_off + "\nNumber of warnings: " + num_warn + " -> " + new_warnings
			
			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was UTC: " + (new Date(new_warn*1000).toISOString().replace("T", " ").substr(0, 19))
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			mod_embed.setAuthor(user)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})

		} else {
			sentFrom.send("Cannot edit a user's warnings if they have no prior removals.")
		}

	});
}


function clearWarnings(sentFrom, user, number_to_clear){

	JSONFile.readFile(config.redditinf, function(err, inf) {

		if (user in inf) {

			new_off = inf[user]["current"]
			old_off = inf[user]["prior"]
			combined = new_off + old_off
			num_warn = inf[user]["warned"][0]
			last_warn = inf[user]["warned"][1]
				
			if (number_to_clear == "all") number_to_clear = new_off

			if (new_off - number_to_clear >= 0){
				new_current = new_off - number_to_clear
				combined = old_off + number_to_clear
				
				console.log(number_to_clear)
				console.log(new_current)
				console.log(combined)

				inf[user]["current"] = new_off - number_to_clear
				inf[user]["prior"] = old_off + number_to_clear
				//inf[user]["warned"][0] += 1
				new_warn = Math.floor((new Date).getTime()/1000)
				inf[user]["warned"][1] = new_warn

				JSONFile.writeFile(config.redditinf, inf, function (err) {
					if (err) { console.error("Error: " + err) }
				})

				desc = "Removals since last warning: " + new_off + " -> " + new_current + "\nRemovals prior to last warning: " + old_off + " -> " + combined + "\nNumber of warnings: " + num_warn + " -> " + num_warn
				
				mod_embed = new Discord.RichEmbed()
				
				timestamp = "Last warning was UTC: " + (new Date(new_warn*1000).toISOString().replace("T", " ").substr(0, 19))
				mod_embed.setDescription(desc)
				mod_embed.setFooter(timestamp)
				mod_embed.setAuthor(user)
				
				sentFrom.send("",{embed: mod_embed, disableEveryone: true})
			}
			else {
				sentFrom.send("Cannot give a user negative removals.")
			}
		} else {
			sentFrom.send("That user has no prior removals.")
		}

	});
}

function countAll(sentFrom){

	JSONFile.readFile(config.redditinf, function(err, inf) {
		var baddies = _.chain(inf).filter(n => (n.prior + n.current) >= 0).orderBy(["current", "prior"], ["desc", "desc"]).map(n => n.current + "+" + n.prior + ": " + n.user).value()
		console.log(baddies);
		console.log(baddies.length)
		sentFrom.send(baddies.length)
	});

}


/*
	Message handling
*/	
bot.on("message", message => {

	var replyregex = new RegExp("^"+config.prefix+"\\d+c*:")
	var inbox = bot.channels.get(config.inbox)
	
	//Ignore messages from bots or blacklisted users
	if (message.author.bot || config.blacklist.includes(message.author.id)) { 
		if (message.author.id != "387620210145886209") {
			return;
		}
	}
	
	//Eval command for debugging with raw Javascript. Only give access to those you trust with access to your system.
	if (message.content.toLowerCase().startsWith(config.prefix+"eval") && config.eval_enabled.includes(message.author.id)) {
			
		try {
			const code = message.content.substr(message.content.indexOf(" "));
			let evaled = eval(code);

			if (typeof evaled !== "string")
				evaled = require("util").inspect(evaled);

			if (!evaled) {
				evaled = "Check logs."
			}
			message.channel.send(evaled, {code:"xl", split:true});
		} catch (err) {
			message.channel.send(`\`ERROR\` \`\`\`xl\n${err}\n\`\`\``);
		}
		
	}
	

	if (message.channel instanceof Discord.DMChannel || message.channel instanceof Discord.GroupDMChannel) {
		
		// Messages coming in from a DM channel are from users
		
		if (!message.content.startsWith(config.prefix)) {

			// If the message has no prefix, treat it as a new conversation

			incomingModmail(message, inbox)

		} else {

			//If the Message has a prefix, treat it as a reply
			
			incomingReply(message, inbox)
		}
	
	} else if ((message.channel == bot.channels.get(config.inbox)) && message.content.startsWith(config.prefix)) {
		
		//If the message came from the anon_inbox, it's from a moderator.
		
		if (message.content.startsWith(config.prefix+"ping")) {
		
			//Moderator command: Check if alive
			
			message.reply("pong!")
			
		} else if (message.content.startsWith(config.prefix+"cases")) {
			
			//Moderator command: Check open cases

			displayCases(inbox)
			
		} else if (message.content.startsWith(config.prefix+"blocked")) {
			
			//Moderator command: Check blocked users

			displayBlockedUsers(inbox)
			
		} else if (message.content.startsWith(config.prefix+"block")) {
			
			//Moderator command: Block user
			
			blockUser(message, inbox)
	
		} else if (message.content.startsWith(config.prefix+"unblock")) {
			
			//Moderator command: Unblock user
			
			unblockUser(message, inbox)

		} else if (message.content.startsWith(config.prefix+"close")) {
			
			//Moderator command: Close a case
		
			closeCase(message, inbox)
			
		} else if (message.content.startsWith(config.prefix+"compare")) {
			
			//Moderator command: Compare authors of two messages

			compareAuthors(message, inbox)

		} else if (message.content.startsWith(config.prefix+"recall")) {
			
			//Moderator command: Compare authors of two messages

			recall(message, inbox)

		} else if (message.content.startsWith(config.prefix+"help")) {
			
			var mod_embed = new Discord.RichEmbed()
			mod_embed.setAuthor("Commands:")
			mod_embed.addField("`"+config.prefix+"ping`","Checks if the bot is alive.")
			mod_embed.addField("`"+config.prefix+"cases`","Lists open cases.")
			mod_embed.addField("`"+config.prefix+"blocked`","Lists blocked users.")
			mod_embed.addField("`"+config.prefix+"block 12345567890`","Blocks a user by their ID.")
			mod_embed.addField("`"+config.prefix+"unblock 12345567890`","Unblocks a user by their ID.")
			mod_embed.addField("`"+config.prefix+"close 123 |or| "+config.prefix+"close 123,456,789`","Closes open cases. Can specify multiple cases in a comma-separated list with no spaces between cases.")
			mod_embed.addField("`"+config.prefix+"compare 1 2`","Checks if two messages were sent by the same user.")
			mod_embed.addField("`"+config.prefix+"123: reply |or| "+config.prefix+"123c: reply and close`","Sends a reply to a case. Adding `c` after the case number will also close it.")
			mod_embed.addField("`"+config.prefix+"recall 123`","Lists the text of the case with that case number.")
			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
			
		} else if (message.content.match(replyregex)) {
			
			//Moderator reply to case
			
			sendResponse(message, inbox, replyregex)

		} else {
			
			if (((/^\![^\?]+$/).test(message.content))) {
				//Catch anything else with config.prefix
				message.reply("No such command, use `"+config.prefix+"help` for a list of commands.")	
			}
			
		}
		
	} else if ((message.channel == bot.channels.get(config.modchat) || message.channel == bot.channels.get(config.meetingroom)) && message.content.startsWith(config.prefix)) {
		
		if (message.content.startsWith(config.prefix+"listagenda")) {
			
			//Moderator command: show agenda for mod meetings

			listAgenda(message)
			
		} else if (message.content.startsWith(config.prefix+"addagenda")) {
			
			//Moderator command: add agenda item
			
			addToAgenda(message)
			
		} else if (message.content.startsWith(config.prefix+"delagenda")) {
			
			//Moderator command: delete agenda item
			
			deleteFromAgenda(message)
			
		}
	} else if ((message.guild.id == config.modguild) && (message.content.startsWith(config.redditprefix))) {
		
		// Commands for subreddit mod discord server

		args = message.content.split(" ")
		sentFrom = message.channel

		if (message.content.startsWith(config.redditprefix+"ping")) {
			
			console.log("Ping from mod server")
			message.reply("pong!")

		} else if (message.content.startsWith(config.redditprefix+"check")) {
			
			console.log("Check from mod server")
			
			if (args.length != 2) {
				message.reply("Usage: `"+config.redditprefix+"check [targetUser]`")
			} else {

				checkUserRemovals(sentFrom, args[1])
			}

		} else if (message.content.startsWith(config.redditprefix+"warn")) {
			
			console.log("Warn from mod server")
			if (args.length != 2) {
				message.reply("Usage: `"+config.redditprefix+"warn [targetUser]`")
			} else {
			
				warnUser(sentFrom, args[1])
			
			}
		} else if (message.content.startsWith(config.redditprefix+"listcurhist")) {

			console.log("Listcurhist from mod server")
			
			listCurrentHistory(sentFrom)

		} else if (message.content.startsWith(config.redditprefix+"listcur")) {

			console.log("Listcur from mod server")
			
			listCurrent(sentFrom)

		} else if (message.content.startsWith(config.redditprefix+"listall")) {

			console.log("Listall from mod server")
			sentFrom.channel.send("Listall doesn't really work anymore, so it's disabled until we actually fix it")
      
			//listAll(sentFrom)

		} else if (message.content.startsWith(config.redditprefix+"listwarn")) {

			console.log("Listwarn from mod server")
			sentFrom.channel.send("Listwarn doesn't really work anymore, so it's disabled until we actually fix it")
      
			//listWarnings(sentFrom)

		} else if (message.content.startsWith(config.redditprefix+"editwarn")) {

			console.log("editWarnings from mod server")

			if (args.length != 3) {
				message.reply("Usage: `"+config.redditprefix+"editwarn [targetUser] [new warnings]`")
			} else {
				args[2] = parseInt(args[2],10)

				if (message.author.id == "109521103990325248") {
				
					editWarnings(sentFrom, args[1], args[2])
				
				} else {
					message.reply("This command is far too dangerous, please ask @DoomZero#6451 if you want to use it.")
				}
			}
		} else if (message.content.startsWith(config.redditprefix+"clearwarnall")) {

			console.log("Clearwarnall from mod server")

			if (args.length != 2) {
				message.reply("Usage: `"+config.redditprefix+"clearwarnall [targetUser]`")
			} else {

				clearWarnings(sentFrom, args[1], "all")
		
			}
		} else if (message.content.startsWith(config.redditprefix+"clearwarn")) {

			console.log("Clearwarn from mod server")

			if (args.length != 3) {
				message.reply("Usage: `"+config.redditprefix+"clearwarn [targetUser] [removals to clear]`")
			} else {
				args[2] = parseInt(args[2],10)

				clearWarnings(sentFrom, args[1], args[2])

			}
		} else if (message.content.startsWith(config.redditprefix+"countall")) {

			console.log("countall from mod server")
			message.reply("countall starting!")	
			countAll(sentFrom)		

		} else if (message.content.startsWith(config.redditprefix+"help")) {
			
			var mod_embed = new Discord.RichEmbed()
			mod_embed.setAuthor("Commands:")
			mod_embed.addField("`"+config.redditprefix+"ping`","Checks if the bot is alive.")
			mod_embed.addField("`"+config.redditprefix+"check SolemnScoldingBot`","Checks removals and warnings for a user.")
			mod_embed.addField("`"+config.redditprefix+"warn SolemnScoldingBot`","Adds a warning to a user and archives current removals.")
			mod_embed.addField("`"+config.redditprefix+"listcur`","Lists users with 3 or more current removals.")
			mod_embed.addField("`"+config.redditprefix+"listall`","Lists users with 3 or more total removals, ordered by current removals.")
			mod_embed.addField("`"+config.redditprefix+"listwarn`","Lists users with 1 or more warnings.")
			message.channel.send("",{embed: mod_embed, disableEveryone: true, split: true})
			
		} else {
			if (((/^\?[^\?]+$/).test(message.content))) {
				//Catch anything else with config.prefix
				message.reply("No such command, use `"+config.redditprefix+"help` for a list of commands.")	
			}
		}
		
	} else {
		return;
	}
});

bot.login(config.token);

/* 
JSONFile.readFile(<FILENAME>, function(err, <OBJNAME>) {
	//Save the data
	JSONFile.writeFile(<FILENAME>, <OBJNAME>, function (err) {
		if (err) { console.error("Error: " + err) }
	})
}); 
*/
