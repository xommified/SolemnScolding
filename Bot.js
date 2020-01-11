var Discord = require("discord.js");
var JSONFile = require("jsonfile");
var schedule = require("node-schedule");
var util = require('util');

var bot = new Discord.Client();
var config = require("./config.json")

var _ = require('lodash');

var MongoClient = require('mongodb').MongoClient;
var url = "mongodb://"+config.dbUser+":"+config.dbPass+"@localhost";
var DBname = config.databaseName;
var modAlias = config.modAlias;

// /r/yugioh

function test (){

	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("infractions").findOne({"user":"DoomZero755"}, function(err, result) {
			if (err) throw err;
			console.log(result["user"]);
			db.close();
		});
	});
}

test();

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
async function getNextCaseNum(dbObj) {

	result = dbObj.collection("counters").findOneAndUpdate(
		{ name: "nextCaseNum" },
		{ $inc: { caseNum: 1 } },
		{ returnOriginal: false },
		
		function(err, result){
			if (err) throw err;
			console.log("getNextCaseNum() = " + result.caseNum)
		}
	)
	return result.caseNum; 
}
*/
function makeNewMessageObj(message, nextCaseNum){
	messageObj = {
		caseNum: nextCaseNum,
		outstanding: true,
		authorID: message.author.id,
		channelID: message.channel.id,
		messageID: message.id,
		inboxID: 0,
		content: message.content,
		attachments: []
	}
	return messageObj
}

/*
	Handle incoming modmails from users
*/
function incomingModmail(message, inbox) {
	// Messages coming in from a DM channel are from users

	// If the message has no prefix, treat it as a new conversation
	console.log("Message from user: (" + message.author + "): "  + message.content)
	
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("counters").findOneAndUpdate(
			{ name: "nextCaseNum" },
			{ $inc: { caseNum: 1 } },
			{ returnOriginal: true }
		)
		.then( result => {
			messageObj = makeNewMessageObj(message, result.value.caseNum)
			//messageResult = 0

			//Retreive the case number, save the message, increment the case number, and add it to the list of outstanding cases
			delete message.embeds
			
			console.log("caseNum: " + messageObj.caseNum)
			
			//Send the message to the inbox
			var mod_embed = new Discord.RichEmbed()	
			mod_embed.setAuthor("Message #" + messageObj.caseNum)
			mod_embed.setDescription(message.content)
			if(message.attachments != null) {
				for (a of message.attachments.values()) {
					mod_embed.setImage(a.proxyURL)
					messageObj.attachments += [a.proxyURL] 
				}
			}

			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				.then(messageResult => {
					messageObj.inboxID = messageResult.id
					console.log(messageResult.id)

					//Save the data
					dbObj.collection("anonMail").insertOne(messageObj, function(err) {
						if (err) { console.error("Error in incomingModmail: " + err) }
						db.close()
					})
				})

			//Send user a delivery confirmation
			var user_embed = new Discord.RichEmbed()
			user_embed.setAuthor("Message sent, your case number is: " + messageObj.caseNum)
			user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+messageObj.caseNum+": Your reply goes here.`\n")
			message.channel.send("",{embed: user_embed, disableEveryone: true})

		})
		.catch( err => function(err) {
			console.log("Error in incomingModmail: " + err)
			console.error("Error in incomingModmail: " + err)
		})
	})
}

/*
	Handle incoming replies from users
*/
function incomingReply(message, inbox, replyregex) {

	if (!message.content.match(replyregex)) 
	{	
		message.reply("Check your syntax and try again.")
		return
	}
	//Response to case
	console.log("Response from user: (" + message.author + "): "  + message.content)

	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);

		//Split up message
		replycasenum = message.content.slice(config.prefix.length, message.content.indexOf(":"))
		console.log("replycasenum: " + replycasenum)
		replyMatch = false
		replycasenum = parseInt(replycasenum)

		dbObj.collection("anonMail").findOne(
			{ "caseNum": replycasenum }
		)
		.then( result => {
			console.log("message.author.id: " + message.author.id)
			if (!result){
				message.reply("That case number has not been used yet!")
				return false
			}
			console.log("result.authorID: " + result.authorID)
			if (result.authorID != message.author.id){
				message.reply("You cannot respond to a case number that does not belong to you. Please double check the number and try again.")
				return false
			}
			
			dbObj.collection("counters").findOneAndUpdate(
				{ name: "nextCaseNum" },
				{ $inc: { caseNum: 1 } },
				{ returnOriginal: true }
			)
			.then( result => {
				messageObj = makeNewMessageObj(message, result.value.caseNum)
				messageObj.content = message.content.slice(message.content.indexOf(":")+1)
				messageObj["replyNum"] = replycasenum

				//Retreive the case number, save the message, increment the case number, and add it to the list of outstanding cases
				delete message.embeds
				
				console.log("caseNum: " + messageObj.caseNum)

				//Send the message to the inbox
				var mod_embed = new Discord.RichEmbed()	
				mod_embed.setAuthor("Message #"+messageObj.caseNum+" in Reply to Message #" + replycasenum)
				mod_embed.setDescription(messageObj.content)
				if(message.attachments != null) {
					for (a of message.attachments.values()) {
						mod_embed.setImage(a.proxyURL)
						messageObj.attachments += [a.proxyURL] 
					}
				}

				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					.then(messageResult => {
						messageObj.inboxID = messageResult.id
						console.log(messageResult.id)

						//Save the data
						dbObj.collection("anonMail").insertOne(messageObj, function(err) {
							if (err) { console.error("Error in incomingModmail: " + err) }
							db.close()
						})
					})

				//Send user a delivery confirmation
				var user_embed = new Discord.RichEmbed()
				user_embed.setAuthor("Message sent, your new case number is: " + messageObj.caseNum)
				user_embed.addField("_","Use your case number when referring to previous messages.\nTo send a followup to this message, reply with: \n`"+messageObj.caseNum+": Your reply goes here.`\n")
				message.channel.send("",{embed: user_embed, disableEveryone: true})
			})
		})
		.catch( err => function(err) {
			console.log("Error in incomingModmail: " + err)
			console.error("Error in incomingModmail: " + err)
		})
	})
}


/*
	Display cases upon moderator request
*/
function displayCases(inbox) {

	console.log("Displaying open cases")
			
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);

		dbObj.collection("anonMail")
		.find({'outstanding': true })
		.project({'caseNum':1,'_id':0})
		.sort({'caseNum':1})
		.toArray(
			function(err, result) {
				if (err) throw err;

				console.log(result);
				resultArray = ""
				result.forEach(function(caseObj){
					resultArray += caseObj.caseNum + ", "
				})
				console.log(resultArray)
				opens = resultArray.slice(0,-2)

				var mod_embed = new Discord.RichEmbed()	
				if (opens == "") {
					mod_embed.setAuthor("No Open Cases")		
				} else {
					mod_embed.setAuthor("Open Cases:")		
					mod_embed.setDescription(opens)
				}
				inbox.send("",{embed: mod_embed, disableEveryone: true})
			}
		); 
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
		message.reply("Usage: `"+config.prefix+"block [caseNum]`")
		return
	} 

	caseNum = parseInt(tokens[1])
	console.log("Blocking user")
	
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);

		dbObj.collection("anonMail").findOne(
			{ "caseNum": caseNum }
		)
		.then( result => {

			console.log("message.author.id: " + message.author.id)
			if (!result){
				var mod_embed = new Discord.RichEmbed()	
				mod_embed.setAuthor("Invalid Case Number")
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				return false
			}

			var mod_embed = new Discord.RichEmbed()	
			
			config.blacklist.push(result.authorID)
			
			mod_embed.setAuthor("User Blocked")		
			mod_embed.setDescription("caseNum: "+tokens[1])
			
			write_config()
			
			inbox.send("",{embed: mod_embed, disableEveryone: true})
		})
	})
}


/*
	Unblock a user from sending modmails
*/
function unblockUser(message, inbox) {

	tokens = message.content.split(" ")

	if (tokens.length != 2 || isNaN(parseInt(tokens[1]))) {
		message.reply("Usage: `"+config.prefix+"unblock [caseNum]`")
		return
	} 

	caseNum = parseInt(tokens[1])
	console.log("Unblocking user")
	
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);

		dbObj.collection("anonMail").findOne(
			{ "caseNum": caseNum }
		)
		.then( result => {

			console.log("message.author.id: " + message.author.id)
			if (!result){
				var mod_embed = new Discord.RichEmbed()	
				mod_embed.setAuthor("Invalid Case Number")
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				return false
			}
	
			console.log("Unblocking user")
			
			var mod_embed = new Discord.RichEmbed()	
			mod_embed.setDescription("caseNum: "+ caseNum)
			console.log(caseNum +" "+ result.authorID)
			var toRemove = config.blacklist.indexOf(result.authorID)
			if (toRemove == -1) {
				mod_embed.setAuthor("No Action - User Not Blocked")
			} else {
				config.blacklist.splice(toRemove, 1)
				mod_embed.setAuthor("User Unblocked")
				write_config()
			}
			inbox.send("",{embed: mod_embed, disableEveryone: true})
		})
	})
}


/*
	Close an open modmail case
*/
function closeCase(message, inbox) {

	tokens = message.content.split(" ")
			
	if (tokens.length != 2) {
		message.reply("Usage: `"+config.prefix+"close 123` or `"+config.prefix+"close 123,456,789` -- (no spaces between cases)")
		return
	}
	
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		
		casenumstr = tokens[1]
		//Convert casenum into an int, then get matching message
		casenum = parseInt(casenumstr)
		
		casesStr = tokens[1].split(",");
		//close just one case
		if (casesStr.length == 1){
			//do the entire function but simplified for one
			caseNum = parseInt(casesStr[0])

			dbObj.collection("anonMail").findOne(
				{ "caseNum": caseNum }
			)
			.then( result => {
				console.log("message.author.id: " + message.author.id)
				if (!result){
					var mod_embed = new Discord.RichEmbed()
					mod_embed.setAuthor("Invalid Case Number:")
					mod_embed.setDescription(caseNum)
					inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					return false
				}
				if (!result.outstanding){
					console.log("Case #" + caseNum + " is already closed!")

					var mod_embed = new Discord.RichEmbed()
					mod_embed.setAuthor("Case Already Closed:")
					mod_embed.setDescription(caseNum)
					inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					return false
				}				

				console.log("Closing case #" + caseNum)
				dbObj.collection("anonMail").updateOne(
					{ "caseNum": caseNum },
					{ $set: {'outstanding':false} },
				function(err) {
					if (err) { console.error("Error in closeCase: " + err) }

					console.log("Case #" + caseNum + " closed successfully!")
					var mod_embed = new Discord.RichEmbed()
					mod_embed.setAuthor("Case Closed:")
					mod_embed.setDescription(caseNum)
					inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					db.close()
				});
			});
		}
		//close multiple cases at once
		else if (casesStr.length > 1){

			cases = []

			closed = []
			notClosed = []
			alreadyClosed = []

			for (caseNum of casesStr){
				cases.push(parseInt(caseNum))
			}

			//Check if the case number exists in records
			dbObj.collection("anonMail")
			.find( { "caseNum": {$in: cases } } )
			.toArray( function (err, result){

				if (!result){
					var mod_embed = new Discord.RichEmbed()	
					mod_embed.setAuthor("Invalid Case Numbers")
					mod_embed.setDescription(cases.join(", "))
					inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
					return false
				}

				//Check provided numbers
				for (caseObj of result) {	
					if (caseObj.outstanding){
						closed.push(caseObj.caseNum)
						console.log("Closing case #" + casenum)
					}
					else {
						alreadyClosed.push(caseObj.caseNum)
					}
				}
				
				//Save the data
				dbObj.collection("anonMail").updateMany( 
					{ "caseNum": {$in: closed} },
					{ $set: {'outstanding': false} },
				function (err){			
					//Output results
					if (closed.length > 0) {
						var embed1 = new Discord.RichEmbed()
						embed1.setAuthor("Cases Closed: ")
						embed1.setDescription(closed.join(", "));
						inbox.send("",{embed: embed1, disableEveryone: true})
					}
					else {
						var embed1 = new Discord.RichEmbed()
						embed1.setAuthor("No Cases Closed!")
						inbox.send("",{embed: embed1, disableEveryone: true})
					}
					if (notClosed.length > 0) {
						var embed2 = new Discord.RichEmbed()
						embed2.setAuthor("Cases Already Closed: ")
						embed2.setDescription(alreadyClosed.join(","));
						inbox.send("",{embed: embed2, disableEveryone: true})
					}
					db.close()
				})
			})
		}
	})
}


/*
	Compare whether the authors of two modmails are the same user
*/
function compareAuthors(message, inbox) {


	//tokens = message.content.split(" ")
	tokens = message.content.split(" ")
	if (tokens.length != 3) {
		message.reply("Usage: `"+config.prefix+"compare num1 num2`")
		return
	} 
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);		

		cases = [parseInt(tokens[1]),parseInt(tokens[2])]

		console.log("Cases:"+cases)

		//Check if the case number exists in records
		dbObj.collection("anonMail")
		.find( { "caseNum": {$in: cases } } )
		.toArray( function (err, result){

			var mod_embed = new Discord.RichEmbed()

			if (!result){
				mod_embed.setAuthor("Invalid Case Numbers")
				mod_embed.setDescription(cases.join(", "))
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				return false
			}

			//console.log(result)

			valid = []
			invalid = []
			authorIDs = []
			for (caseObj of result) {
				if (cases.includes(parseInt(caseObj.caseNum))){
					console.log(true)
					authorIDs.push(caseObj.authorID)
					valid.push(caseObj.caseNum)
					console.log(authorIDs)
				}
				else {
					console.log(false)
					invalid.push(caseObj.caseNum)
				}
			}
			if (cases.length != result.length){
			    console.log("length mismatch!");
			    for (x of cases){
			        if (!valid.includes(x)){
			            invalid.push(x)
			        }
			    }
			}
			if (invalid.length != 0) {
				mod_embed.setAuthor("Invalid case(s)")
				mod_embed.setDescription(invalid.join(", "))
				console.log("Invalid case(s)!")
			} 
			else if (authorIDs.length >=2){
				console.log("Testing cases: " + tokens[1] + " and " + tokens[2])
				if (authorIDs[0] == authorIDs[1]) {
					mod_embed.setAuthor("Messages are from the same user")
					mod_embed.setColor(1046381)
					console.log("Match found!")
				} else {
					mod_embed.setAuthor("Messages are not from the same user")
					mod_embed.setColor(13632027)
					console.log("No match found!")
				}
			}
			else {
				console.log("valid array is bad length!")
			}
			inbox.send("",{embed: mod_embed, disableEveryone: true})
		});
	});
}

//compareAuthors("compare 259 260",320438920775204864)

/*
	Send a response from a moderator to an open case and possibly close the case.
*/
function sendResponse(message, inbox) {

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

		console.log("casenum: " + casenum)
		casenum = parseInt(casenum)

		MongoClient.connect(url, function(err, db) {
			if (err) throw err;
			var dbObj = db.db(DBname);

			dbObj.collection("anonMail").findOne(
				{ "caseNum": casenum }
			)
			.then( result => {
				console.log("message.author.id: " + message.author.id)
				if (!result){
					message.reply("That case number has not been used yet!")
					return false
				}
				console.log("result.authorID: " + result.authorID)

				message.guild.members.get(result.authorID).send("",{embed: user_embed, disableEveryone: true})
			
				console.log("Sent reply to " + result.authorID + ", case #" + casenum + "- " + answer)

				//Send delivery confirmation to mods
				var mod_embed = new Discord.RichEmbed()
				mod_embed.setAuthor("Reply sent to: ")
				mod_embed.setDescription(casenum)
				if (!close) {
					inbox.send("",{embed: mod_embed, disableEveryone: true})
				}
				else {
					if(!result.outstanding){
						mod_embed.setAuthor("Message delivered, case already closed: ")
						inbox.send("",{embed: mod_embed, disableEveryone: true})
					}
					else {
						dbObj.collection("anonMail").updateOne(
							{'caseNum':casenum},
							{$set: {'outstanding':false}},
							function(err, result2) {
								if (err) { console.error("Error in incomingModmail: " + err) }
								mod_embed.setAuthor("Message delivered, case closed: ")
								console.log("case closed, result:")
								console.log(result2.result)
								inbox.send("",{embed: mod_embed, disableEveryone: true})
								db.close()
							})
					}
					
				}	
			})				
			.catch( err => function(err) {
				console.log("Error in incomingModmail: " + err)
				console.error("Error in incomingModmail: " + err)
			})
		})
	}
}

function recall(message, inbox){
	//get case number from message
	tokens = message.content.split(" ")
	casenumstr = tokens[1]

	//Convert casenum into an int, then get matching message
	casenum = parseInt(casenumstr)

	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);

		//Check if the case number exists in records
		dbObj.collection("anonMail").findOne(
			{ "caseNum": casenum }
		)
		.then( result => {
			console.log("message.author.id: " + message.author.id)
			if (!result){
				var mod_embed = new Discord.RichEmbed()	
				mod_embed.setAuthor("Invalid Case Number")
				inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
				return false
			}
			console.log("result.authorID: " + result.authorID)


			targetMessage = result.content
			targetMessageID = result.inboxID
			console.log("inboxID = " + result.inboxID)
			targetMessageLink = "https://discordapp.com/channels/132566085638553600/470344591049097236/" + targetMessageID 

			//Begin building the recall message
			var mod_embed = new Discord.RichEmbed()	
			mod_embed.setAuthor("Recalling Message #" + casenum)
			
			console.log("Attempting to recall targetMessage #" + targetMessageID)
			if (targetMessageID === undefined || targetMessageID === 0){
				//Failed to find a valid targetMessageID
				console.log("Attempt to recall targetMessage #" + targetMessageID + ": failure")
			}
			else {
				//Found a valid targetMessageID, so append the link to the message
				console.log("Attempt to recall targetMessage #" + targetMessageID + ": success")
				targetMessage += "\n [Link to Message](" + targetMessageLink + ")"
			}	
			
			//Add the message body to the embed
			mod_embed.setDescription(targetMessage)
			
			/*if(message.attachments != null) {
				for (a of message.attachments.values()) {
					mod_embed.setImage(a.proxyURL)
				}
			}*/
			inbox.send("",{embed: mod_embed, disableEveryone: true, split: true})
			
		})
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

function parseTimestamp(timestamp){
	console.log("inputTimestamp: " + timestamp)
	year = timestamp.slice(0,4)
	month = timestamp.slice(4,6)
	day = timestamp.slice(6,8)
	hour = timestamp.slice(8,10)
	minute = timestamp.slice(10,12)
	second = timestamp.slice(12,14)
	console.log(year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second)
	return year+"-"+month+"-"+day+" "+hour+":"+minute+":"+second
}

function updateRemovalCount(){
}

function sendNotAuthorizedMessage(sentFrom, redditName){
	mod_embed = new Discord.RichEmbed()

	mod_embed.setAuthor(redditName)
	mod_embed.setDescription("You are not authorized to do that. Please ask an authorized mod to run this command for you.")

	sentFrom.send("",{embed: mod_embed, disableEveryone: true})
}

function warnUser(sentFrom, args, mod, modAuthed){
	if (!modAuthed){
		sendNotAuthorizedMessage(sentFrom, mod)
		return
	}

	if (args.length != 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"warn [targetUser]`")
		return
	}

	user = args[1]

	var userObj
	console.log("warning user: " + user)
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("infractions").findOne({"user":user}, function(err, result) {
			if (err) throw err;
			userObj = result;
			
			activeRemovals = 0
			archivedRemovals = 0
			combined = 0
			warns = 0

			lastWarnDate = 0
			desc = ""
			console.log(userObj)
			
			if (userObj == null){
				console.log("No database entry for that user!")
				desc = "No database entry for that user."
			}
			else {
				activeRemovals = userObj["active"]
				archivedRemovals = userObj["archived"]
				combined = activeRemovals + archivedRemovals
				warns = userObj["warns"]
				lastWarnDate = -1
				if (userObj.warnings && userObj.warnings.length != 0)
					lastWarnDate = userObj.warnings.reverse()[0].warnTime

				userObj["active"] = 0
				userObj["archived"] = combined
				userObj["warns"] += 1
				d = new Date

				newWarnDate = 
					d.getFullYear()
					+ ("0"+ (d.getMonth()+1)).slice(-2)
					+ ("0" + d.getDate()).slice(-2)
					+ ("0" + d.getHours()).slice(-2) 
					+ ("0" + d.getMinutes()).slice(-2)
					+ ("0" + d.getSeconds()).slice(-2);

				if (userObj["removals"]){
					userObj["removals"].forEach(function(removal){
						if (removal["active"] == true)
							removal["active"] = false
					})
				}

				newWarnObj = {
					"warnTime": newWarnDate,
					"mod": modAlias[mod]
				}
				userObj["warnings"].push(newWarnObj)
				dbObj.collection("infractions").replaceOne({"user":user}, userObj, function(err) {
					if (err) { console.error("Error: " + err) }
				});

				desc = "Active removals: " + activeRemovals + " -> 0\nArchived removals: " + archivedRemovals + " -> " + combined + "\nWarnings: " + warns + " -> " + (warns+1)
			}

			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was: Never"
			if (lastWarnDate != -1) {
				if (lastWarnDate == 0){
					timestamp = "Last warning was before 2019-10-15"
				}
				else {
					timestamp = "Last warning was UTC: " + parseTimestamp(lastWarnDate)
				}
			}
			mod_embed.setAuthor(user)
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})

			db.close();
		});
	});
}

function clearWarn(sentFrom, args, mod, modAuthed){

	if (!modAuthed){
		sendNotAuthorizedMessage(sentFrom, mod)
		return
	}

	console.log("Clearwarn from mod server")	

	if (args.length != 3) {
		sentFrom.send("Usage: `"+config.redditprefix+"clearwarn [targetUser] [removals to clear]`")
		return
	} 
	user = args[1]
	number_to_clear = parseInt(args[2],10)

	var userObj
	console.log("clearwarning user: " + user)
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("infractions").findOne({"user":user}, function(err, result) {
			if (err) throw err;
			userObj = result;
			
			activeRemovals = 0
			archivedRemovals = 0
			combined = 0
			warns = 0

			lastWarnDate = -1
			desc = ""
			console.log(userObj)
			if (userObj == null){
				console.log("No database entry for that user!")
				desc = "No database entry for that user."
			} else {
				activeRemovals = userObj["active"]
				archivedRemovals = userObj["archived"]
				combined = activeRemovals + archivedRemovals
				warns = userObj["warns"]
				warnings = userObj.warnings
				if (userObj.warnings.length >= 1){
					console.log(userObj.warnings.length)
					lastWarnDate = userObj.warnings.reverse()[0].warnTime
				} //else lastWarnDate = -1

				userObj["active"] = activeRemovals - number_to_clear
				userObj["archived"] = archivedRemovals + number_to_clear
				//userObj["warns"] += 1
				d = new Date

				newWarnDate = 
					d.getFullYear()
					+ ("0" + (d.getMonth()+1)).slice(-2)
					+ ("0" + d.getDate()).slice(-2)
					+ ("0" + d.getHours()).slice(-2) 
					+ ("0" + d.getMinutes()).slice(-2)
					+ ("0" + d.getSeconds()).slice(-2);
				
				timestamp = "Last warning was: Never"
				if (lastWarnDate != -1) {
					if (lastWarnDate == 0){
						timestamp = "Last warning was before 2019-10-15"
					}
					else {
						timestamp = "Last warning was UTC: " + parseTimestamp(lastWarnDate)
					}
				}

				if (userObj["active"] < 0) {
					console.log("Removals would go negative, so not doing anything.")
					desc = "Cannot give a user negative removals."
				}
				else {
					userObj["removals"].forEach(function(removal){
						if (removal["active"] == true && number_to_clear > 0){
							removal["active"] = false
							number_to_clear -= 1
						}
					})
					console.log(number_to_clear)
					dbObj.collection("infractions").replaceOne({"user":user}, userObj, function(err) {
						if (err) { console.error("Error: " + err) }
					});

					desc = "Active removals: " + activeRemovals + " -> " + userObj["active"] + "\nArchived removals: " + archivedRemovals + " -> " + userObj["archived"]+ "\nWarnings: " + warns + " -> " + warns
				}
			}
				
			mod_embed = new Discord.RichEmbed()
			
			mod_embed.setAuthor(user)
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})
		});
	});
}

function addWhitelist(sentFrom, args, mod, modAuthed){
	

	if (!modAuthed){
		sendNotAuthorizedMessage(sentFrom, mod)
		return
	}

	if (args.length != 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"addwhitelist [targetUser]`")
		return
	} 
	
	username = args[1]

	console.log("whitelist from mod server")

	JSONFile.readFile(config.redditshadowbans, function(err, shadowbanObj) {
		console.log("Adding " + username + " to the whitelist")
		placeInBans = shadowbanObj["bans"].findIndex(function(element){ return element == username })
		placeInWhitelist = shadowbanObj["whitelist"].findIndex(function(element){ return element == username });
		if (placeInBans == -1 && placeInWhitelist == -1){
			console.log(username + " is not on either list yet, adding them to whitelist")
			shadowbanObj["whitelist"].push(username)
			sentFrom.send(username + " added to whitelist.")
		}
		else if (placeInWhitelist != -1){
			console.log(username + " is already on the whitelist, doing nothing")
			sentFrom.send(username + " is already on the whitelist.")
		}
		else if (placeInBans != -1){
			console.log(username + " is already on the banlist, removing them and adding them to the whitelist")
			shadowbanObj["bans"].splice(placeInBans,1)
			shadowbanObj["whitelist"].push(username)
			sentFrom.send(username + " removed from banlist, and added to whitelist.")
		}
		
		JSONFile.writeFile(config.redditshadowbans, shadowbanObj, {spaces: 4}, function (err) {
			if (err) { console.error("Error: " + err) }
		})
	});
}

function registerNewMod(sentFrom, args, senderID, mod, modAuthed){
	
	if (!modAuthed){
		sendNotAuthorizedMessage(sentFrom, mod)
		return
	}

	if (args.length != 3) {
		sentFrom.send("Usage: `"+config.redditprefix +"registernewmod [redditName] [discordID]`")
		return
	} else if (!RegExp(/^\d{15,19}/).test(args[2])) {
		sentFrom.send("That is not a valid Discord ID.\nUsage: `"+config.redditprefix +"registernewmod [redditName] [discordID]`")
		return
	} 

	console.log("registerNewMod from mod server")

	redditName = args[1]
	discordID = args[2]

	var userObj
	console.log("Adding [" + redditName + "] as a new mod with the discord ID [" + discordID + "]")
	MongoClient.connect(url, function(err, db) {
		if (err) { console.error("Error: " + err) }

		var dbObj = db.db(DBname);


		newModObj = {
			'redditName': redditName,
			'discordID': discordID,
			'addNewMods': false
		}

		dbObj.collection("mods").findOne({'discordID':senderID}, function(err, result) {
			if (err) { console.error("Error: " + err) }
			if (result && result.addNewMods) {
				dbObj.collection("mods").updateOne({'redditName':redditName}, 
				{$setOnInsert:
					{
						'discordID': discordID,
						'addNewMods': false
					}
				}, {upsert:true}, 
				function(err, result) {
					if (err) { console.error("Error: " + err) }
					else {
						mod_embed = new Discord.RichEmbed()
						mod_embed.setAuthor(redditName)
						
						desc = ""
						if (result.upsertedCount >= 1){
							desc = "Added [" + redditName + "] as a new mod with the discord ID [" + discordID + "]"
						}
						else {
							desc = "That mod is already registered."
						}

						mod_embed.setDescription(desc)
						sentFrom.send("",{embed: mod_embed, disableEveryone: true})
					}
				});		
			}
			else {
				mod_embed = new Discord.RichEmbed()
			
				mod_embed.setAuthor(redditName)
				mod_embed.setDescription("You are not authorized to do that. Please ask an authorized mod to run this command for you.")
			
				sentFrom.send("",{embed: mod_embed, disableEveryone: true})
			}
		})
		
	});
}

/*function editWarnings(sentFrom, user, new_warnings){

	JSONFile.readFile(config.redditinf, function(err, inf) {

		if (user in inf) {
			activeRemovals = userObj["active"]
			archivedRemovals = userObj["archived"]
			warns = userObj["removals"]
			last_warn = inf[user]["warned"][1]
			
			userObj["removals"] = new_warnings
			new_warn = Math.floor((new Date).getTime()/1000)
			inf[user]["warned"][1] = new_warn
			
			JSONFile.writeFile(config.redditinf, inf, function (err) {
				if (err) { console.error("Error: " + err) }
			})

			desc = "Recent removals: " + activeRemovals + " -> " + activeRemovals + "\nArchived removals: " + archivedRemovals + " -> " + archivedRemovals + "\nWarnings: " + warns + " -> " + new_warnings
			
			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was UTC: " + (new Date(new_warn*1000).toISOString().replace("T", " ").substr(0, 19))
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			mod_embed.setAuthor(user)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})

		} else {
			sentFrom.send("Cannot edit a user's warnings if they have no archived removals.")
		}

	});
}*/

/*
	Check a user's post removals on the subreddit. 
*/
function checkUser(sentFrom, args){
	console.log("check from mod server")
	if (args.length != 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"check [targetUser]`")
		return
	} 
	
	user = args[1]

	var userObj
	console.log("Looking up user: " + user)
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("infractions").findOne({"user":user}, function(err, result) {
			if (err) throw err;
			userObj = result;
			
			activeRemovals = 0
			archivedRemovals = 0
			combined = 0
			warns = 0

			lastWarnDate = -1
			desc = ""
			console.log(userObj)
			if (userObj == null){
				console.log("No database entry for that user!")
				desc = "No database entry for that user."
			}
			else {
				activeRemovals = userObj["active"]
				archivedRemovals = userObj["archived"]
				warns = userObj["warns"]
				lastWarnDate = 0
				if (userObj.warnings && userObj.warns != 0){
					lastWarnDate = userObj.warnings.reverse()[0].warnTime
				}

				desc = "Active removals: " + activeRemovals + "\nArchived removals: " + archivedRemovals + "\nWarnings: " + warns
			}
			mod_embed = new Discord.RichEmbed()
			
			timestamp = "Last warning was: Never"
			if (lastWarnDate && lastWarnDate != -1) {
				if (lastWarnDate == 0){
					timestamp = "Last warning was before 2019-10-15"
				}
				else {
					timestamp = "Last warning was UTC: " + parseTimestamp(lastWarnDate)
				}
			}
			mod_embed.setAuthor(user)
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})
			db.close();
		});
	});
}

function checkUserRemovals(sentFrom, args){
	console.log("checkremovals from mod server")

	if (args.length != 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"checkremovals [targetUser]`")
		return
	} 
	
	user = args[1]

	var userObj
	console.log("Looking up user: " + user)
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;
		var dbObj = db.db(DBname);
		dbObj.collection("infractions").findOne({"user":user}, function(err, result) {
			if (err) throw err;
			userObj = result;
			
			activeRemovals = 0
			archivedRemovals = 0
			combined = 0
			warns = 0

			mod_embed = new Discord.RichEmbed()

			lastWarnDate = -1
			desc = ""
			console.log(userObj)
			if (userObj == null){
				console.log("No database entry for that user!")
				desc = "No database entry for that user."
			}
			else {
				activeRemovals = userObj["active"]
				archivedRemovals = userObj["archived"]
				warns = userObj["warns"]
				removalList = userObj["removals"]
				lastWarnDate = 0
				if (userObj.warnings && userObj.warns != 0){
					lastWarnDate = userObj.warnings.reverse()[0].warnTime
				}
				for (removal of removalList){
					console.log("removal in removalList")
					console.log(removal)
					removal.timePosted > 0 ? 
						timestamp = parseTimestamp(removal.timePosted) : 
						timestamp = "Before 2019-10-15"
					link = "**Link**: https://old.reddit.com/"+removal.shortlink
					active = "\n**Status**: "+(removal.active?"Active":"Archived")
					mod = "\n**Mod**: "+removal.mod
					time = "\n**Time**: "+timestamp
					command = "\n**Command**: "+removal.rule
					console.log(link)
					console.log(active)
					console.log(mod)
					console.log(time)
					console.log(command)
					removalDesc = link + active + mod + time + command + "\n\n"  
					
					mod_embed.addField(removal.shortlink, removalDesc)
				}
			}
			
			timestamp = new Date().toISOString().substr(0, 19).replace('T', ' ');

			mod_embed.setAuthor(user)
			mod_embed.setDescription(desc)
			mod_embed.setFooter(timestamp)
			
			sentFrom.send("",{embed: mod_embed, disableEveryone: true})
			db.close();
		});
	});
}

function listCurrent(sentFrom, args){
	
	if (args.length > 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"listcur [optional: minimum]`")
		return
	}

	if (args.length == 2) removalNum = parseInt(args[1])
	else removalNum = config.redditremovalnumber

	console.log("Listcur " + removalNum + " from mod server")

	MongoClient.connect(url, function(err, db) {
		if (err) throw err;

		var dbObj = db.db(DBname);
		dbObj.collection("infractions")
			.find({'active': {$gte: removalNum} })
			.sort({'archived':-1, 'active':-1})
			.toArray(
				function(err, result) {
					if (err) throw err;
					
					result = result.map(n => n.active + ": " + n.user).join("\n")

					resultMsg = "No users with " + removalNum + " or more active removals."
					
					if (result != "") {
						resultMsg = "Listing users with " + removalNum + " or more active removals:\n```" + result + "```"
						if (resultMsg.length > 2048){
							resultMsg = "Too many users with " + removalNum + " or more active removals! Please try a higher minimum!" 
						} 
					}
					sentFrom.send(resultMsg)
					console.log(result);
				}
			); 
	});
}

function listCurrentHistory(sentFrom, args){

	if (args.length > 2) {
		message.reply("Usage: `"+config.redditprefix+"listcurhist [optional: minimum]`")
		return
	}

	if (args.length == 2) removalNum = parseInt(args[1])
	else removalNum = config.redditremovalnumber

	console.log("Listcurhist " + removalNum + " from mod server")

	MongoClient.connect(url, function(err, db) {
		if (err) throw err;

		var dbObj = db.db(DBname);
		dbObj.collection("infractions")
			.find({'active': {$gte: removalNum} })
			.sort({'archived':-1, 'active':-1})
			.toArray(
				function(err, result) {
					if (err) throw err;
					
					result = result.map(n => "(" + n.warns + ") " + n.archived + "|" + n.active + ": " + n.user).join("\n")

					resultMsg = "No users with " + removalNum + " or more active removals."

					if (result != ""){
						resultMsg = "Listing users with " + removalNum + " or more active removals:\n```(Warnings) Archived | Active:\n" + result + "```"
						if (resultMsg.length > 2048){
							resultMsg = "Too many users with " + removalNum + " or more active removals! Please try a higher minimum!" 
						} 
					}
					sentFrom.send(resultMsg)
					console.log(result);
				}
			); 
	});
}

/*
	Lists all warnings that have been given by the bot, for all users with warnings.
*/
function listWarnings(sentFrom, args){
	console.log("Listwarn from mod server")

	if (args.length > 2) {
		sentFrom.send("Usage: `"+config.redditprefix+"listwarn [optional: minimum]`")
		return
	}
	
	if (args.length == 2) warnNum = parseInt(args[1])
	else warnNum = 1

	console.log("Listwarn " + warnNum + " from mod server")

	MongoClient.connect(url, function(err, db) {
	if (err) throw err;

	var dbObj = db.db(DBname);
	dbObj.collection("infractions")
		.find({'warns': {$gte: warnNum} })
		.sort({'warns':-1})
		.toArray(
			function(err, result) {
				if (err) throw err;
				
				result = result.map(n => n.warns + ": " + n.user).join("\n")

				resultMsg = "No users with " + warnNum + " or more warnings."

				if (result != ""){
					resultMsg = "Listing users with " + warnNum + " or more warnings:\n```Warns:\n" + result + "```"
					if (resultMsg.length > 2048){
						resultMsg = "Too many users with " + warnNum + " or more warnings! Please try a larger number!" 
					} 
				}
				sentFrom.send(resultMsg)
				console.log(result);
			}
		); 
	});
}

/*function listAll(sentFrom){
	
	MongoClient.connect(url, function(err, db) {
		if (err) throw err;

		var dbObj = db.db(DBname);
		dbObj.collection("infractions")
			.find({'active': {$gte: config.redditremovalnumber} })
			.sort({'archived':-1, 'active':-1})		//.filter(n => (n.archived + n.active) >= config.redditremovalnumber)
			.toArray(
				function(err, result) {
					if (err) throw err;

					result = result.map(n => n.archived + "+" + n.active + ": " + n.user).join("\n")

					if (result == "") {
						sentFrom.send("No users with " + config.redditremovalnumber + " or more active removals.")
					} else {
						sentFrom.send("Listing users with " + config.redditremovalnumber + " or more total removals (archived + active):\n```" + result + "```")
					}
					console.log(result);
					
				}
			); 
	});
}*/

/*function countAll(sentFrom){

	JSONFile.readFile(config.redditinf, function(err, inf) {
		var baddies = 
			_.chain(inf)
			.filter(n => (n.archived + n.current) >= 0)
			.orderBy(["current", "archived"], ["desc", "desc"])
			.map(n => n.current + "+" + n.archived + ": " + n.user)
			.value()
		console.log(baddies);
		console.log(baddies.length)
		sentFrom.send(baddies.length)
	});
}*/

//list all the regexes that are being used to report comments
/*function listRegexes(sentFrom){
}*/

function listBans(sentFrom){
	
	JSONFile.readFile(config.redditshadowbans, function(err, shadowbanObj) {
		result = ""
		shadowbanObj["bans"].forEach(function(element){
			result += "- " + element + "\n"
		})

		sentFrom.send("```\nShadowban List:\n\n" + result + "```")
	});
}

function listWhitelist(sentFrom){
	
	JSONFile.readFile(config.redditshadowbans, function(err, shadowbanObj) {
		result = ""
		shadowbanObj["whitelist"].forEach(function(element){
			result += "- " + element + "\n"
		})

		sentFrom.send("```\nShadowban Whitelist:\n\n" + result + "```")
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
		prefix = config.redditprefix

		//trim the prefix from the command
		command = args[0].slice(prefix.len,)

		MongoClient.connect(url, function(err, db) {
			if (err) { console.error("Error: " + err) }
			
			dbObj = db.db(DBname);
			senderID = message.author.id

			dbObj.collection("mods").findOne({'discordID':senderID}, function(err, result) {
				modAuthed = false
				if (result) modAuthed = true

				commandRegexString = 
					"(" 
					+ "warn"
					+ "|clearwarn"
					+ "|addwhitelist"
					+ "|registernewmod"
					+ "|ping"
					+ "|checkremoval"
					+ "|check"
					+ "|listcurhist"
					+ "|listcur"
					+ "|listall"
					+ "|listwarn"
					+ "|listban"
					+ "|listwhitelist"
					+ "|help"
					+ ")"

				commandRegex = new RegExp(commandRegexString,"i")

				commandRegexResult = commandRegex.exec(command);

				switch(commandRegexResult[0]){
					case "warn":
						warnUser(sentFrom, args, message.author.username, modAuthed)
						break

					case "clearwarn":
						clearWarn(sentFrom, args, message.author.username, modAuthed)
						break

					case "addwhitelist":
						addWhitelist(sentFrom, args, message.author.username, modAuthed)
						break

					case "registernewmod":
						registerNewMod(sentFrom, args, message.author.id, message.author.username, modAuthed)
						break

					case "ping":
						console.log("Ping from mod server")
						sentFrom.send("pong!")
						console.log("Pong!")
						break

					case "check":
						checkUser(sentFrom, args)
						break

					case "checkremoval":
						checkUserRemovals(sentFrom, args)
						break

					case "listcurhist":
						listCurrentHistory(sentFrom, args)
						break

					case "listcur":
						listCurrent(sentFrom, args)
						break

					case "listall":
						console.log("Listall from mod server")
						sentFrom.send("Listall doesn't really work anymore, so it's disabled until we actually fix it")
						//listAll(sentFrom)
						break

					case "listwarn":
						listWarnings(sentFrom, args)
						break

					case "listban":
						console.log("listbans from mod server")
						listBans(sentFrom)
						break

					case "listwhitelist":
						console.log("listwhitelist from mod server")
						listWhitelist(sentFrom)
						break

					case "help":
						var mod_embed = new Discord.RichEmbed()
						mod_embed.setAuthor("Commands:")
						mod_embed.addField("`"+config.redditprefix+"ping`","Checks if the bot is alive.")
						mod_embed.addField("`"+config.redditprefix+"check [user]`","Lists all removals and warnings for a user.")
						mod_embed.addField("`"+config.redditprefix+"checkremovals [user]`","Generates a list of posts the user has had removed.")
						mod_embed.addField("`"+config.redditprefix+"warn [user]`","Adds a warning to a user's record and archives all active removals.")
						mod_embed.addField("`"+config.redditprefix+"clearwarn [user] [number]`","Archives [number] active removals on a user's record without adding a warning.")
						mod_embed.addField("`"+config.redditprefix+"listcur [optional: minimum]`","Lists all users with [minimum] or more active removals. (Default: " + config.redditremovalnumber + ")")
						mod_embed.addField("`"+config.redditprefix+"listcurhist [optional: minimum]`","Lists all users with [minimum] or more active removals, and includes their past removals. (Default: " + config.redditremovalnumber + ")")
						//mod_embed.addField("`"+config.redditprefix+"listall`","Lists users with " + config.redditremovalnumber + " or more total removals, ordered by active removals.")
						mod_embed.addField("`"+config.redditprefix+"listwarn [optional: minimum]`","Lists all users with [minimum] or more warnings. (Default: 1)")
						//mod_embed.addField("`"+config.redditprefix+"listregexes`","Lists the regexes being used to report comments in #report_feed.")
						mod_embed.addField("`"+config.redditprefix+"addwhitelist [user]`","Adds a user to the shadowban whitelist. This means their comments will never be auto-removed.")
						mod_embed.addField("`"+config.redditprefix+"listbans`","Lists all users on Scolding's shadowban list.")
						mod_embed.addField("`"+config.redditprefix+"listwhitelist`","Lists all users on Scolding's shadowban whitelist.")
						message.channel.send("",{embed: mod_embed, disableEveryone: true, split: true})
						break
					
					default:
						sentFrom.send("No such command, use `"+config.redditprefix+"help` for a list of commands.")	
				}
/*	
				} else if (message.content.startsWith(config.redditprefix+"editwarn")) {

					console.log("editWarnings from mod server")

					if (args.length != 3) {
						sentFrom.send("Usage: `"+config.redditprefix+"editwarn [targetUser] [new warnings]`")
					} else {
						args[2] = parseInt(args[2],10)

						if (message.author.id == "109521103990325248") {
						
							editWarnings(sentFrom, args[1], args[2])
						
						} else {
							sentFrom.send("This command is far too dangerous, please ask @DoomZero#6451 if you want to use it.")
						}
					}
*/		
/*
				} else if (message.content.startsWith(config.redditprefix+"countall")) {

					console.log("countall from mod server")
					sentFrom.send("countall starting!")	
					countAll(sentFrom)
		      		
		      	} else if (message.content.startsWith(config.redditprefix+"listregexes")) {

					console.log("listregexes from mod server")
					listRegexes(sentFrom)
*/	
			})
			db.close();
		})
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
