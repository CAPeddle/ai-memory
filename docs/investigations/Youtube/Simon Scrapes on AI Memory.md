https://www.youtube.com/watch?v=UHVFcUzAGlM&t=1s

## Links

John & Paweł’s system - https://www.youngleaders.tech/p/how-i-finally-sorted-my-claude-code-memory
Paweł’s substack - https://substack.com/@huryn/note/c-216337711?r=1to7jv
Memsearch - https://github.com/zilliztech/memsearch 
Mempalace - https://github.com/MemPalace/mempalace 
LLM Wiki - https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
Recall - https://www.recall.it/ 
Mem0 - https://mem0.ai/ 
OpenBrain - https://github.com/NateBJones-Projects/OB1


## Transcript
0:00
Right now, if you search for the best claw code memory system, you get absolutely buried. Mem zero, Carpathy's
0:06
Obsidian Wiki, Open Claw and Hermes, Mem Palace, Light Rag, Clawude Mem, Claw
0:12
Mem. It's getting ridiculous to keep up with it. But after spending hours researching it, these aren't competing
0:18
tools. They're different ways of handling memory depending on your use case. And the reason I went deep on this
0:24
is because I've been building out my own agentic operating system. basically a business brain that runs across
0:29
everything I do. So, I needed to figure out what actually works, what scales, and what just adds complexity to my
0:36
existing setup. So, in this video, I'll walk through six levels of memory that build on top of each other, all the way
0:42
to systems that work across every single AI tool that you use. So, by the end, you'll know exactly which one makes
0:47
sense for your use case and which ones you can completely ignore. But before we go ahead through the levels, one thing I
0:52
want you to know now because it will make the rest of the video easier to follow is that every memory system is
0:58
answering exactly the same question. When you give claw code a task, how does it pull the right context at the right
1:04
time? So the difference I'm going to show you between each level is just two things. First is where your memory
1:10
lives. So it's going to be the storage mechanism for your data and what the file structure looks like, whether it's
1:16
marked down or stored as vectors, for example. And secondly is how Claude actually gets hold of that data, which
1:23
is just the retrieval stage. So some stuff's going to get copied into Claude's context automatically. Some stuff is going to sit in a database and
1:29
get searched exactly when it's needed. Some stuff's going to live on your laptop. Some's going to live on the cloud, etc., etc. So let's jump now into
Level 1: What Ships With Claude Code Natively
1:37
level one. So you can think of level one as the native stuff that ships inside claw code. So most of you have already
1:43
heard of the claw.md file. Some of you have heard of memory.mmd, but very few people are actually using both together
1:50
properly. So, let's do claw.md first. And as most of you know this one already, I'll keep it quick, but it's
1:56
effectively a plain markdown file inside your project folder where you store your rules, stuff about your brand, things
2:02
about how you work with clients, coding style, and it's always loaded into every single session you pull up inside the
2:08
terminal. You can think of it like a note that is just at the start of the context, almost like a system prompt
2:14
that you're giving to Claude. So you can actually have this at the Claude project folder level to pass to all of your
2:20
Claude instances. You can have it slightly lower at the root folder level if you have multiple projects which sit
2:25
within the same folder. Or you can even have it in the individual project level for specific project instructions. The
2:31
lower down the folder structure you go, it still inherits the parent claude.mmd, but any conflicting rules, it will
2:37
always take the local claw.md as gospel for specific project level instructions.
2:42
But here's the thing that most people actually get wrong with their claude.md. And I've seen this a lot, which is stuffing too much into the claude.md. So
2:50
putting in your full brand guide, your tone of voice document, your complete client list. Think about when Claude actually starts a session every single
2:56
time. It's going to burn through that context window reading all of it. So yes, it's important context, but only
3:01
when you load it in at the right time. And this is exactly the problem we're trying to solve called context ro. So
3:07
this is the inability for AI and LLM models to actually recall 100% of the information that we've loaded in as we
3:14
increase the amount of context that's loaded in in the first place. So as a general rule of thumb, keep your claud under 200 lines. And then if you've got
3:21
more context like a brand voice document then you can put that in a separate external file that's referenced from the
3:26
claw.md and therefore it will only pull it in at the right time when it needs it. So the second built-in memory system
3:31
inside claw code already running on your machine is called automemory and that forms a memory.mmd file. So you can jump
3:38
into an existing project folder to see this best and what you can do is type in /memory.
3:44
You'll hit enter and you'll see there are a few different things. There can be imported memory if you're using a separate memory system and we'll come to
3:51
separate memory systems. You've got project and user memory which are effectively your claude.md files at different levels in the root folder.
3:57
We're going to open up the automemory folder. You'll see that we have on a per project basis effectively a memory
4:03
structure with an me memory file. So if I open up all these files inside the memory MD file, we effectively have an
4:10
index of lots of different memories that claw code can actually reference and open up other files of. So it's not just
4:16
dumped a a huge amount of memories in here. What it's done is said on a project basis, we've got a specific
4:22
project level feedback and on a more general scale, we've got a bunch of different feedback for specific things
4:28
that it can refer back to kept as separate documents. It's following exactly what we've talked about, which is don't just dump more than 200 lines
4:35
in a single file. Always reference a separate file and treat the memory MD or
4:41
the claw.md as an index and then point to another file. So for example, we've got here a file that's feedback on
4:47
project structure. So level two or three projects go under project/briefs. And you can see separately we've got
4:53
feedback project structure.md which is a specific bit of feedback that only needs to be loaded in when Claude understands
5:00
that we're looking at project structures table of contents of different bits of feedback that you've given it over time
5:06
or it's understood from the way that you work. Hence this file here on a specific project basis. And to demonstrate this
5:13
further, I'll go to an empty folder. And you'll see that there's no memory. MD file or claude.md file inside that. So
5:19
if I run the /memory command and I hit autoopen memory folder, then you can see
5:25
that because it's done on a project level basis. There's no memory consolidation there. So you don't
5:30
actually have to create that memory.md file. It's just quietly taking notes on your tasks and on your feedback in the
5:36
background. And then it's created all those files as an index for me. So claude.md and memory. IMD is what Claude
5:41
has today. And it's also very clear that Anthropic is trying to tackle this problem themselves. And that's evident
5:47
because when the Claude code source accidentally leaked a couple of weeks back, people found references to a
5:52
system or framework called Chyros and had a look through the code. And it's an unreleased always on demon that watches
5:59
your project continuously, decides what's worth remembering, and then consolidates old notes while you sleep.
6:05
So it's not in any public build yet, but for sure Anthropic in the background is working on features to actually solve
6:12
this context rock problem and improve the native memory system. So it's only going to get better from this point. So
6:17
level one, the setup is already done for you. It's in the background. It's completely free to use. You just need to
6:24
be able to actually use them properly. So you might have noticed this if you keep repeating information to Claude that you think it should already know.
6:30
And that is where level two comes in. So level two improves the reliability of feeding those memory files in at the
Level 2: Forcing Reliable Memory Recall
6:36
right time as well as improves the in-built structure inside cla MD. I
6:41
found an article by a guy called John Connelly who's taken a concept by Pavl
6:46
Hurin a huge name in tech who wrote this on the 18th of Feb. How to give claude code memory paste this into your
6:53
projects claude. MD and bearing in mind this was before it was announced that Claude had this automemory feature but
6:59
what it now does is effectively build on that structure of Claude and then when
7:05
we combine it with John's we've got the ability to actually inject that automatically at the start of every
7:10
single session. So basically what we're doing is we're adding in to the claude.md a big prompt all about how to
7:16
manage memory and the rules in managing memory too structured memory system rooted atclaude/memory.
7:22
We already saw our automatic memory system inside Claude, but instead we've got a structure here. We've got
7:27
memory.mmd general.mmd which stores all cross project facts preferences environment setups but then we've also
7:34
got domainspecific knowledge where we effectively have domain/topic and each topic can have its own markdown
7:41
file with domain specific knowledge one file per topic and the same with tools we can have individual tools like
7:47
slack.md with a specific tool config workaround edge cases for that specific
7:53
tool and what this basically does is we're going to add this to our claw md and we're going to go into plan mode.
7:58
We're effectively going to get it to set up a memory structure for our project that we then can automatically inject
8:05
into every single session. Now, this works using a claude code session start hook to ensure that when you open up
8:11
that new terminal or even spin-off sub aents, it automatically loads the memory or the memory MD index into session
8:19
files. And if you've not used a hook before, it does exactly that. It's just a little script that basically says at specific moments like session start I'm
8:26
going to inject that context into claude and we're not loading in the full context. We're just loading in the memory.mmd file which is that index if
8:33
you remember. And the second most exciting thing about this is the potential for sharing this between teammates. So imagine if you could sync
8:40
those domain files that we talked about. So we have different products and different projects between your teammates. So if somebody's working on a
8:46
different project, they can save memory files to do with that context in the shared folder that we all can access
8:53
inside our team. And the idea is it's specific granular detail that claw code actually needs to be useful for that
8:59
domain or that tool. Now let's get it set up to show you exactly how it works. So what we're going to do is go to the
9:04
link that I'll leave down below in the description under level one and we're going to copy this whole markdown section for part one. So basically
9:12
adding this to claw.md. What it's going to do is create a global memory directory structure which you'll
9:17
probably have already based on claude's auto memory. We're going to update the claude.md file. We're going to initialize project memory.mmd files. And
9:24
what it's basically looking out for is when I say reorganize memory, it's going to read all the memory files. Remove the
9:30
duplicates and outdated entries. Merge our entries that belong together. So basically consolidating our memories,
9:36
split files that cover too many topics, restore entries by date, and update the memory. MD index. So every so often
9:43
we're effectively going to be reorganizing our memories. But first we just need to copy this into a prompt.
9:49
We're not actually putting this directly in our claude.md file. What we are doing is opening up a new terminal window
9:54
inside an existing project or an empty project. I've got my Aenttos demo project here. I'm going to switch mode
10:00
using shift and tab twice to put it on plan mode. And I'm going to paste in that entire prompt. What it's going to
10:06
effectively do then is plan out a structure for our memory files and what
10:11
to add to our Claude. MD file based on what already exists and based on what already exists in our memory files. And
10:16
once Claude has built the plan for part one, which was the one we copied in above, we're going to switch into plan
10:21
mode again and run reorganize memory. So, we're planning out this first. We're going to build it and then we're going
10:27
to run reorganize memory with a plan to basically tidy up our memory files and see what it's built out of our previous
10:34
project. So super simple. We're just going to wait for that to execute, check the plan, build it, and then execute the
10:41
phrase reorganize memory to actually then push through all those changes. And you can see right now it's exploring the
10:47
memory system state before it comes back to us with a plan. And it's come back to us with a plan structured persistent
10:53
memory management system, setting up a global structured memory system for claw code so that knowledge persists across sessions and projects. So currently our
11:00
root claw.md exists but is empty. Claude memory does not exist and only one of
11:05
our 28 projects has a memory/memory.mmd file. So you can see this has checked all the way up the parent tree to
11:12
understand what exists at the highest level that will be inherited downwards. And the current project because it's a
11:18
demo has an empty memory/ directory. No memory md. So it's going to create a
11:24
global memory directory structure with general tools domain. It's going to
11:29
update our claw.md with all five sections. Memory management, global memory, repo memory,
11:35
auto init, which basically autocreates memory.mmd on a session start. And it's effectively going to go through all of
11:41
our files and create that memory system and structure that we can then use to
11:47
actually reorganize memory and basically set up a bunch of different domain and tool files. So, we're going to yes,
11:53
clear context and bypass permissions and get it to execute on that. Then after that we will set up the ability to
11:59
actually auto inject using the hook so that every time we load up a session it auto injects that memory index. So it's
12:06
now built all of that. So it's created the global memory structure and you can
12:11
actually commandclick into any of these files and we can see sync rules between global memories and project memories the
12:19
structure of the file and it's got the general andd the tools the domains. We can also see that got a uh cross project
12:25
conventions like a general MD file and it's also done project memory.mmd file. So on a specific project basis for all
12:32
the projects we've done 28 projects it's created a specific memory MD file or consolidated that for that specific
12:39
project and you saw before that I didn't have any for previous projects except for the Aentic OS in which there was one
12:46
memory file. So what we need to do do now is just run reorganize memory. We'll make sure it's on plan mode and not
12:52
bypass permissions mode. And it's going to come up with a plan to reorganize the memory and therefore it will start
12:57
filling these memory MD and the claude.mmd files with the relevant folder structure outlined here. So we
13:03
should see the general MD start to fill out the tools and the specific domain structure and it will tell us what it's
13:10
actually going to create and then it will actually start creating that. Whilst that is happening, let's take a look at step two which is actually
13:16
introducing the hook. So this hook basically injects your project memory and the global memory. MD index, if you
13:24
remember that just points to the right memory files before the first tool call of every session. So this means that
13:30
when you spin up an agent or a sub agent, it's going to basically throw in that index so it knows what memories it
13:37
has access to. And we're just going to copy this file here. And in summary, tells it to create the settings.json
13:42
JSON hook that says when it's uh pre-tool use, make sure to run the
13:48
pre-toolmemory.sh file and it's going to create the pre-toolmemory.sh file, which is just
13:53
the script to effectively load in the memory files that we've just created. And then it's going to go and update our claude.md to say instead of reading the
14:00
claude/memory/memory md at session start, it's going to auto inject it this time. So it's not relying
14:07
on Claude actually reading it and taking action. It's going to auto inject it automatically because this is a hook.
14:13
And you can see after 5 days of usage for John specifically the number of memory files had increased
14:19
significantly. So up 90% and significantly more lines but it hasn't increased the memory. MD or general MD
14:26
by a huge amount because those are just index files pointing to the correct tools, the correct domains and the
14:33
correct cycle files. So, I've asked it to reorganize the memory. And this is really brilliant. I'm just reading through this now. It's basically looked
14:40
through my Aenttos folder and said it's found 11 or 12, sorry, empty memory
14:47
files, like daily memory files. So, there's an empty template, empty template, two empty sessions. So, it's
14:53
saying actually, we just need to delete those because what's the point in having them? It's a waste of loading them in. Some identical first run onboarding
15:00
empties. A bunch of empties there. And then part of phase two, it's basically going to trim the empty sessions. Phase
15:06
three, resolve stale open threads. So it's actually read through the specific threads in our daily memories and
15:11
basically going to go and find exactly what happened after those actions were taken to make sure that they're updated.
15:17
And you can see it does this for a few different daily memory files. And then it's going to go through and actually add some cross references to all of
15:24
these different projects that we've done to make sure that they link together correctly. It's going to update our general MD with all of these different
15:31
projects that we've been working on, update the indexes inside the memory.mmd file, and then go through a verification
15:36
phase to make sure that that all happens. So, we're basically going to run yes, clear context, and bypass permissions. It's going to make all
15:42
those changes for us. And from this point onwards, we have a memory system that has a clear structure at our global
15:48
directory. So, all verifications pass. It deleted the 13 files, trimmed six
15:54
sessions, finished the nine open threads, added 10 cross references,
15:59
three patterns were added to general.mmd. It has remaining daily files of 12 with
16:05
meaningful content, so it's got rid of the rubbish, and it's cleared all the empty memory directories inside the
16:10
client's folders. So now we're going to run the second prompt. And again, we're going to run it on plan mode, and then
16:16
we're going to execute the plan to add to the settings.json. So that injects this every time we start a new session.
16:22
Okay. So it's come up with a plan. It's going to basically register the hook in settings.json, update our global memory
16:28
and claw.md so that it effectively has all of this knowledge that we're building into it. And that means everything will be executed
16:34
automatically when a session starts. So for a lot of you, this will be enough.
16:39
But the moment you start running this for more than a few weeks, you're going to hit a couple of problems and your
16:45
files are starting to get really messy. And the keyword search that works for a small amount of files using this system
16:52
is going to stop working as we grow and start to scale. So this is where level
Level 3: Search by Meaning, Not Just Keywords
16:57
three comes in. And this is where we start to get a bit more serious about how memory is actually organized and how
17:02
it is searchable. But before we move on to that, YouTube tells me that 97% of
17:07
you are watching this video right now haven't subscribed to the channel. So do me a quick favor and hit the subscribe
17:13
button below if you've made it this far. So only add to level two if these two
17:19
things are true. One, you've been using Claude code for more than a month and your memory files have grown past a
17:25
handful of files. And two, if you've ever typed a question to Claude where you know the answer is somewhere in your
17:31
notes, but Claude couldn't actually find it, then it might be a sign to move on to level three. So at level two, we've
17:37
got Claude loading memory more reliable. But as you start to scale this, when you're running it for real for months
17:43
across multiple clients or projects, the structure eventually stops scaling. So you end up with a giant general MD file
17:49
that can't be read efficiently. And because it's summarizing key topics and not taking words verbatim, the keyword
17:55
search starts falling apart as well. So level 3 is designed to solve both. And the template for level 3 comes from an
18:02
AI agent that you're probably familiar with called openclaw. So the open claw file structure is effectively from that
18:08
standalone open claw agent. It's not from claw code but their memory design system is something that's really
18:14
genuinely powerful and clean. So it's got three different layers. First you have a memory MD which is your long-term
18:20
durable facts. So things that don't change often like your preferences, your decisions, facts about your business,
18:26
and these are loaded in at the start of a recession. Second, you've got your daily note files. So you've got one file
18:32
per date and you can think of these as a running log. What happened today, what got decided, what got shipped, what
18:38
didn't work, and it's basically today and yesterday's notes that get loaded automatically. And older ones are going
18:44
to stay on the disc, but they're not going to get loaded into context. And then third, with open claw, there's an optional thing called dreaming. So it's
18:51
a background process that's going to read through your daily notes, score them, and promote the ones that keep
18:57
coming up again and again into your long-term memories. Memory MD. and the stale stuff is going to get forgotten
19:02
completely so it doesn't blow your context. So you basically then have a mechanism with a proper short-term
19:07
memory deciding with the dreaming process what is actually embedded into our long-term memory and fed into
19:13
claude. So it brings us to a framework called memsarch which is actually a plugin and it basically ports that
19:20
framework from open core over to claw code. So it's built by a company called zillus and that's a team behind one of
19:26
the most popular open-source vector databases out there. So they know a thing or two about searching by
19:32
semantics and searching by meaning and that's exactly what this is designed to do. So they've extracted open claw's
19:38
memory architecture into a standalone library that plugs straight into claw code with a twoline install. So it's got
19:44
all the benefits of the openclaw method which is the markdown first philosophy. So everything we can go we can see we
19:50
can read through and we can port it to different systems. It's got the same chunking strategy as open claw, the same
19:55
file structure with the memory.mmd and the daily notes, but now it works inside claw code too. And the way it works is
20:01
it basically chunks your documents, everything you write into semantic vectors so that when we are actually
20:08
searching for information, it's understanding the meaning behind our questions and the meaning behind the
20:13
stuff we've stored rather than just using keyword search. But it takes that one level further and applies a concept
20:18
we've already seen already, which is actually hooks. So it auto injects the top matches into every single prompt. So
20:25
as soon as we write a prompt, it's going to use a hook called user prompt submit and it's going to feed in our top three
20:31
semantic matches from our memory files directly into the context for claw code.
20:37
So you don't have to remember to ask cla to search it. It's going to inject the most relevant parts of your memory files
20:44
into the context pretty quickly as soon as you're actually typing in a query. So if you want to install this, we just
20:50
need to take these two lines here. I'm going to go and open up a new folder and open up cl code. And I'm just going to
20:56
use the /plugin marketplace. Add zillastte mem search. It's going to find the repository and clone the repository.
21:04
And we're going to choose to add this to our local folder so that we're not adding it above all the other memory systems that we're considering today.
21:10
And then I'll grab the second line, plugin install memarch, and I'm going to install for you in this repo only like
21:17
we just mentioned. And you can see it's spun up a settings.local.json file enabled plugins inside there and mem
21:23
search plugins is true inside there. So you need to run / reload plugins and
21:29
that will help activate it. And we'll also just c twice and then reopen claw
21:34
code. And then to actually verify it's working there's some GitHub instructions which I'll leave down below. We basically need to have a few
21:40
conversations. So have a few conversations with it and then check your memory files. So to check your memory files, you just need to basically
21:46
use the ls command inside a terminal, which is going to list whatever we're asking it to list. So mem search/memory
21:54
files, and you should see today's date inside a memory file. So go ahead, have a conversation and then list and verify
22:00
that that's working correctly. Or you can actually use the built-in skill that installs and that is uh memory recall.
22:07
So you can see me search, search and recall relevant memories from past sessions via mem search. So you can run that even as a slash command if you
22:13
wanted to, but obviously we've got no daily memory files yet. It will start from this point as we start building out conversations. And you can see it's
22:20
using the hook user prompt submit and it's searching through the mem search files now. And this system is super
22:25
similar to what we're actually using in our own Aentic OS to keep those daily log files as well as that long-term
22:32
memory file that we can actually semantically push into the context at the right time. Now, there's another alternative worth knowing about, but in
22:38
my opinion, not really as suitable for us called Claude MEEN. And it's a claude code plugin that automatically captures
22:43
everything Claude does during your coding session, compresses it with AI, injects relevant context back into
22:49
future sessions. So, sounds almost exactly the same, super popular, has a similar goal, but a different philosophy. So, this uses MCP tools and
22:56
a three tier storage model. So, it stores summaries, timeline, and observations. And it has more features
23:03
than me search out the box. like it's got a little dashboard to actually search through the memories if you want. It's got team collaboration features,
23:10
cost tracking, privacy labels, but in my opinion, it's a bit overkill for what we actually need. So, if you want that
23:16
management layer on top of your memory, then claude mem might be able to give you that. But for our use case, it's MCP
23:22
based, which means Claude has to actively decide to call the search tool rather than just injecting it from a local database like me search. And the
23:29
other major difference between claude mem and mems search is claude mem is actually going to store everything in the background whereas mems search is
23:35
going to keep everything in plain markdown so you can actually go back and read it. So you've got auto injections everything in readable markdown and open
23:42
clause great memory patterns without actually having to leave claw code. Now level four is where we get serious with
Level 4: Recall Verbatim Conversations
23:48
conversation recall. So word for word recall using a service called me palace
23:54
or a framework called me palace. So, you only need to go to this level if you catch yourself thinking, I know we
23:59
discussed this a few weeks ago, but I can't remember exactly what was decided. So, where level three finds our notes
24:05
and a summary of those notes, level four is designed to find exactly the words
24:10
that were used when you made a decision. And the best part about it is it's all stored locally on your system. So,
24:17
compared to the other levels so far, this is a proper RAG system. It's free and right now it's got the highest
24:24
benchmark score of any memory system ever published apparently. So because it stores words verbatim, nothing ever gets
24:31
summarized. So nothing can actually theoretically get lost. So here are a few snippets from the website. You can
24:36
see the content stays verbatim always. The index above it is written in a a k a
24:43
dense symbolic dialect and LLM can scan at a glance. So it's written in effectively a different language. And
24:48
this is what it looks like. It's got a bunch of pointers that are pointing to locations of specific data. So you
24:55
effectively are searching an index which is pointing to a specific area or draw
25:00
as they call it inside the second database and therefore it's able to go and retrieve that information straight
25:06
away. So they've got an example here. My son's name is Noah. He turns six on September the 12th. So this is what
25:11
you'd say into the LLM. He loves dinosaurs, etc., etc. And the pointer is
25:16
then indexed as okay, Noah, son, age six, date of birth. And it stores a
25:22
bunch of information in that drawer that can then basically point it directly to draw 007 inside wing 42 room 11. And
25:31
we'll come to the importance of that structure in a second. But we can basically pull information out directly
25:37
as it is stored. So when we are semantically searching for information, it basically uses this memory palace
25:43
which is an ancient method of memory to store things in wings, rooms, closets
25:48
and drawers. And we just saw exactly that. The pointer of a wing represents people's projects and topics. The rooms
25:54
could be days, sessions or threads. The closets could be topics, threads or bundles. And then inside that is the
25:59
verbatim text. So it's got a series of nested bits of information that points
26:04
it to the exact correct place. And that's how it's able to actually retrieve information or store information. And because it's stored in
26:11
that symbolic index, the AA language, it lets the model scan thousands of draws
26:17
in a single pass. And it happens super quickly. So you can see an example up here without me palace and with meal. So
26:23
with me palace, it basically as soon as you say something, it's going to go and file it in a specific draw. So wing room
26:30
draw. Two weeks later when you ask it a question, you're going to see it's going to retrieve in such a quick time 42
26:36
milliseconds from that exact draw and it can even pull the verbatim text to. Now
26:41
this effectively uses two separate databases. An SQL database that tracks entities and relationships between them
26:47
and a Chroma DB or a Chroma vector database that stores every single conversation as searchable chunks as
26:54
we've seen in the drawers. And similar to some of the previous levels, it's also using background hooks to silently
27:01
store and index information. So filing and indexing happen silently through claw code hooks on session end. So we've
27:07
seen the session start hook on session end on pre-ompaction. So if you're about to compact, it will also fire the hook.
27:14
You write it and the palace is going to basically put that information somewhere behind the curtain. Now it's super easy
27:19
to install. You're basically building your palace. One command to install. So, you're going to run the commands listed
27:25
down here. I'll link down in the description below to the me palaceofficial.com. But you're going to basically install it, initialize it, and
27:32
it's going to create a palace structure, wings, rooms, drawers in a me palace folder. It's going to register all the
27:39
hooks in your settings.json file, and then it's going to start working. And you can even retrospectively mine your
27:45
previous information, your previous sessions by using this mine function. So at this level then with me palace Claude
27:52
can literally search every single conversation you've ever had in plain English word for word because it's all
27:58
going to be indexed in that memory palace file structure in the background. Now one of the downsides here is we
28:03
don't have that verbatim in markdown. So it's not exactly readable directly but we can retrieve information easily and
28:11
quickly in that way. But even now everything's still locked to your local machine. Everything we talked about so far most of it is locked on your local
28:18
machine. But what about the research you did in chat GPT 3 or 4 months ago, the
28:23
brainstorming you did on your phone? So that's where level five and six come in. And they're totally different because
28:28
it's not about remembering conversations anymore. It's about how do we actually have conversations across multiple tools
28:35
and also reliably store research that connects all of our different information. So everything sits in an
28:41
isolated drawer in this instance and actually none of the knowledge is connected. So let's move on to level five. So at this level for the me
Level 5: Build a Self-Organizing Knowledge Base
28:47
palace, Claude can literally search every single conversation you've ever had in plain English word for word
28:54
because it's all index in your memory palace. But even now up to this point, everything's still locked into your
29:00
machine. So what about the research you did in chatbt last year, the brainstorm you did on your phone the other day?
29:06
That's where level five and six come in. And they're totally different. They're not about remembering conversations
29:11
anymore. It's about building up a knowledge base across tools. So level five is totally different actually. It's
29:19
not anymore about remembering conversations. The me palace is kind of the best the pinnacle of remembering
29:26
word for word conversations. So now it's about actually if you want to build a knowledge base of interconnected
29:33
information. So you want to add level five if you regularly consume
29:39
information that you want to keep and connect over time. So think about articles, videos, podcasts, client
29:45
notes, anywhere where you're actually just reading a lot of information and losing track of what you actually
29:51
learned. You can connect that all into a interconnected knowledge base. So it's less about one-off projects and more
29:57
about building that second brain on topics that you actually care about. But to be honest, I'd skip this if you
30:03
consume content casually and don't need to come back to it later. The most popular library out there for this you
30:09
might have seen already. It's Andre Carpathy's GitHub repo called LLM wiki or his markdown file which talks about
30:15
the idea of LLM wikis and it's received a huge amount of coverage. So what makes it a bit different is that it's a
30:22
pattern for using claude to build a living wiki about any topic that you care about. So you literally just create
30:27
two folders inside your project. You create a raw folder where you drop your source documents which your articles,
30:33
your reports, your podcast transcripts, YouTube video transcripts, PDFs and Claude is going to read from this folder
30:39
but never actually write to this folder. And then you have a wiki folder which Claude owns completely. So it's going to
30:45
write every file, maintain the structure, update cross references as you go and you never actually write
30:51
yourself to the wiki. And the whole thing again is in just plain markdown files. So we don't have an external
30:56
database or a vector database. It's all in readable markdown files again. And
31:02
all you effectively need are the files that we've spoken about Obsidian and an
31:07
AI. And effectively inside Obsidian, which is a separate software that you can download for free. Once you compile
31:15
all of your resources, you'll get this knowledge graph of how your different resources interconnect. And you've
31:20
probably seen a ton of other people demonstrating this on videos. I'm not going to do a video specifically dedicated to this method because
31:26
actually I don't think it's super relevant for how we want to synthesize information and I think Donnelly in this
31:32
article summarized it quite well. It's best in use cases where you have a folder called save for later which is
31:37
basically a pile of bookmarked Slack threads, YouTube videos, client notes that you never go back to that you want
31:43
to see the interlinking relationships with and as it sounds effectively create a Wikipedia on a specific subject topic.
31:51
So this is if you want to do deep research on interconnected topics. But in my opinion, I can't see the directly
31:57
applicable use cases for retrieving this information in this manner inside a system like the business OS or the
32:02
Aentic OS. If you disagree with me, I'd love to hear why in the comments below. Maybe I've missed the point of this one.
32:08
I can see some use cases like actually opening up wikis for specific key topic
32:13
areas you're researching in and actually having those visualized and interconnected. But in the way that we're using it for business use cases to
32:19
build out projects, I'm not sure it's the best way to utilize a memory system
32:24
apart from just doing deep research on a specific topic. I've also had a few people actually surface a similar
32:30
alternative called recall because it's been blowing up online. So recall is a hosted service that's basically
32:36
Karpathy's wiki, the LLM wiki done for you. So you install a browser extension,
32:42
you can save articles, you can save all your podcasts, PDFs, etc. and Recall summarizes, tags, and auto builds that
32:49
knowledge graph for you without the the setup headache, but to be honest, it's quite easy to set up the LLM wiki for
32:54
yourself. There's plenty of tutorials out there that can show you how. And Recall seems to give you its own AI chat interface, so you can actually go and
33:01
chat to your saved content, so it works on your phone. And they also have MCP access, so you can directly connect it
33:06
to claw code. And this in some ways is better than LLM Wiki because there's zero setup. You don't need to configure
33:12
or download Obsidian and it's basically just available through a login and all the work is obviously done for you too.
33:18
Why I think it's not as good as Carpathy's pattern for most people. The first one is ownership. So you don't actually own the data. Recall lets you
33:25
export everything to markdown if you want to. But while it's live, it's actually live on their servers. So you're effectively renting and not
33:32
owning your own information. And secondly, Recall seems to be built for content consumption, not operational
33:38
memory. So, it would be really good for a use case like I've watched 40 YouTube videos on blog code. Uh, which one
33:46
talked about memory and what did they mention about memory? But it's not necessarily designed for what did we
33:51
decide about client X's landing page and the conversion rates back in March. And then thirdly, because it is a
33:57
off-the-shelf software, there is a pricing implication too with that. So, my take is if you're non-technical and
34:02
you mainly want to organize articles, videos, and podcasts, then recall is great. But if you want maximum control
34:08
and you still want to build out that Wikipedia, then the LLM wiki will definitely beat you there. There's also
34:14
a quick mention for a heavyweight alternative which is similar like knowledge graph style called light rag.
34:19
So light rag is an enterprisegrade knowledge graph and it's designed for heavier entity extraction dual level
34:25
retrieval the full research grade thing basically but it's completely overkill
34:30
for 99% of business owners. You don't need the setup headache. You don't need the massive database in the background
34:36
for that and you're better off either going back to level four or if you're looking for a visual knowledge base then you can install carpathies or use recall
34:42
but to be clear I think both of these are for building knowledge bases not for operational memory and therefore it
34:49
probably wouldn't be used in many of our own use cases apart from research so at this point we've covered a huge amount
34:55
and well done if you stuck with it so far but also up until this point everything lives inside core code and
35:01
some of you may actually not just use core code you might use chatbt on your phone, you might use cursor. And when
35:06
you start using multiple AI tools, none of them know anything about each other. So everything we've installed so far has
35:12
been inside CL code. But level six is a method I've seen called open brain by Nate Jones, who has brilliant knowledge
Level 6: A Single Brain For ALL Your AI Tools
35:18
in this space. And the intent of this is to actually allow you to switch between AI tools constantly like chat on your
35:26
phone, claw code at your desk, and it's the only system today where all of your different AIs that you're using are able
35:31
to see the same memory automatically in real time. So arguably it's the most futurep proof and most portable because
35:37
actually your memory for this is going to live in a Postgress database that you own. So when the next big AI tool drops
35:44
in 6 months, say you just connect it to your existing Postgress brain and there's no actual migration needed. But
35:50
if you're still living mostly in Cycl code on one machine, then it's probably worth skipping this part. So it is what
35:56
it says on the tin. It's an infrastructure layer for your thinking. So it's one database, one chat channel,
36:03
and any AI you use can plug into it, which makes it super powerful if you work across apps. You're not connected
36:09
to any SAS and it's super cheap to run. I think it's less than a dollar a month to run this. So it runs on a Postgress
36:15
database hosted on Superbase and inside that database there's basically one table called thoughts and every row is a
36:22
single memory. So it's a chunk of text an embedding vector to be able to search for it and some tags and an associated
36:29
time stamp when it was said and then it uses in-built extensions that handle all that semantic search for you. So we
36:35
basically have an MCP server running from claw code that connects up to superbas's edge functions that act as a
36:42
front door for every ai tool that wants to read from the database. So if that's
36:47
sounding a little bit complicated it's because one of the downsides of this it does have an AI assisted setup but it is
36:52
going to take significantly longer to set up than some of these others and significantly longer to understand
36:58
versus others here. So, you have a full setup guide, which I'll link down below, or a video walkthrough on YouTube from
37:04
Nate himself, as well as some companion prompts that help you migrate your memories from existing Claw Code memory
37:11
systems over to this open brain. And the idea is super simple and follows a lot
37:16
of what we've seen so far. For retrieval, Claude Code is going to directly query it and chat is also able
37:22
to query it. Claude Desktop is able to query it. Cursor is able to query it. They all use just the same brain
37:28
effectively. And I'm not going to set this one up live as it is probably overkill for most people, but I'll link
37:33
to Nate's guide which is written for nontechnical people and you'll get through it if you want to do the setup in about 30 to 45 minutes. Now, there is
37:40
a live community about this. So, I recommend having a look in the GitHub and actually joining that community if
37:45
you're interested in hearing more or getting some help with the setup there. But if you're somebody that wants to actually keep your memory portable and
37:52
not associated with just claw code, then this is probably the right solution for you. Now, there is an alternative that I
37:58
quickly wanted to mention here called Mem0ero. And it's another cross tool memory layer. It's wellunded. It's
38:04
really well marketed and widely used already by developers. And you can see like used by 100,000 developers from all
38:11
of these large companies. So, if you wanted something that's more production ready strength, then definitely check out mem.ai. Especially because the setup
38:19
is designed to actually just get you started in less than a minute and you still have a universal self-improving AI
38:25
memory layer for your LLM applications and it's completely cross tool as well. So if you're actually shipping an AI
38:31
product for example, then this might be a sensible choice for you. But again, one of the downsides here is that your
38:36
data is going to live on their servers permanently. Whereas something like open brain, you actually own the superbase
38:42
project and you can export the whole Postgress database whenever you want and control access to multiple different
38:47
tools. So in terms of level six versus all the different levels, this is probably the most complex to set up. Not
38:54
mem, but open brain. And it's the only one really that's going to introduce significant costs per month. Although
39:00
Open Brain, as we mentioned, is going to be like 10 to 30 p per month on the free tier of Superbase. But one of the
39:05
downsides compared to the other levels we've seen one we're still storing away from our laptop. So it's not locally
39:11
held data. It is secure in a database but it effectively means we have to query an external facing database every
39:18
single time which is going to add some latency to our process. But that might be the compromise you're willing to make
39:23
if you want every single AI tool you use to share that same memory for you. So I know that has been a ton of different
39:30
information. So I wanted to just touch on how do you just get started today and which one should you pick. So if you are
39:36
literally just starting then don't worry about these memory systems. Turn on level one by just utilizing your
39:42
claude.md and your memory.mmd files in the right way. It's going to take you 10 minutes and it's going to be a massive
39:47
improvement on the inbuilt memory inside. If you've been using claude code for a little bit then you can go to
39:53
level two install John's hook and then honestly most of you should stop right there. But if you started to build up
40:00
significant amount of context and you're losing old decisions across months of work, then you can either go to level
40:06
three and install mem search or level four where we're actually verbatim word for word retrieving information from me
40:13
palace. Level five and six kind of took us into a completely different realm for specific use cases. Level five was
40:19
Karpathy's LLM wiki, which is best if you want to do some deep research on a specific topic and reference the
40:25
relationship between the subtopics in that topic. And then level six was all about actually if you want something that you own that's still relatively
40:31
cheap but you can plug into any external AI tool or LLM in the future then you want to go with something like open
40:37
brain or mem. And the best part about all the things that we covered today is a lot of them do stack together. So you
40:43
can run levels 1 2 and three together with no issues and actually the folder structure is fairly sim similar and you
40:49
can ask claw code to actually integrate those yourself. And in terms of what I am personally implementing, I'm
40:55
implementing up to level three inside the agentic operating system. So following those open claw conventions,
41:01
but also adding on the semantic search capability and the hooks that enable actually injection of certain context at
41:07
a certain time and that just improves the search and recall functionality inside the business operating system. So
41:13
if you want to see more about exactly how to build out your own agentic operating system, then watch the next video. Thanks for watching. didn't see
41:19
you in the next one.
