https://www.youtube.com/watch?v=dxq7WtWxi44


41,000 bookmarks and hundreds of DMs
0:00
Everybody is going nuts about the wiki idea that Andre Carpathy posted a couple of days ago. 41,000 people have
0:07
bookmarked it. And on the surface, it sounds ridiculously simple. You use your AI to build and maintain a personal
0:12
wiki. As someone who launched something somewhat similar with OpenBrain, I have gotten hundreds of DMs and emails
0:17
saying, "Nate, is this the same thing? Nate, is this different? Nate, does this make OpenBrain obsolete? Nate, is the
0:23
wiki better?" I want to actually step back and give you a different answer
0:28
than you expected. We are going to go through, we are going to talk about what
0:33
the wiki approach gets right, why Andre put it together, the principles
0:38
underlying this wiki approach versus the open brain approach. And I want to be honest about why we're doing that. We're
0:45
not doing that just for giggles. We're doing that because deciding how you organize your context layer is one of
0:50
the single most important things you can do in 2026. It is a really big deal. And Karpathy's approach is really different
0:56
from OpenBrain. It's not the same thing at all. And there are specific reasons why he went with his decision and why I
1:02
went with the decisions that I made to construct open brand. And I'm going to be really open about both. I'm not going
1:08
to give you a steelman. I'm not going to say one is better than the other. So just get that out of your head. We're going to talk about where each one
1:14
breaks, the scale issues that each have, and where each one is strong. And then I
1:19
promise you, I am going to help you solve the problem because I know that what most of you are going to say is, "I want the best of both worlds." We are
1:26
going to get there. I put a plugin into OpenBrain that will help you have the
1:31
best of both worlds. So you can have the wiki approach Carpathy takes with the structured data that OpenBrain brings.
1:37
And by the end of this video, you'll understand why it matters to be able to do both and you'll feel equipped to make
1:43
that decision. So let me explain a little bit about what's under the surface that is a little bit more
1:49
complex than it might appear at first glance. Because on the surface, Carpathy's implementation is very simple. It's just folders and it's text
1:56
files. That is the big idea for him. And you might wonder why did he go so simple? Well, his insight is the idea
2:02
that everybody uses AI with their documents today all day, right? You upload files to chat GPT, you use
2:08
notebook LM, you use cloud, and you always end up in a place where you have bunches of documents everywhere and then
2:15
you ask a question and the AI has to go and find relevant chunks of documents, previous chats, reads them, gives you an
2:21
answer. It's all hyper fragmented all over. This works okay, but it's actually
2:27
not ideal because what's happening under the hood is that AI is effectively rediscovering your knowledge from
The insight underneath the simplicity
2:32
scratch every single time you ask a question. So, if you ask a question that requires connecting five different
2:38
documents across six different chats, the AI has to find all five, read the six chats, figure out how they relate,
2:44
and produce some kind of a synthesis. If you ask a similar question tomorrow, it does the whole thing over again. Nothing
2:51
was saved about that synthesis. It doesn't inherently preserve connections between documents, even if you're in the
2:58
same chat application, let alone if you're in two or three different AIs like so many of us are. In other words,
3:03
the AI did real cognitive work and then threw it all away. And that is what
3:09
bothered Carpathy enough to put together a different solution. What he asked is, what if instead of just finding relevant
3:15
chunks and answering questions, the AI actually wrote down what it learned? What if every time you added a new
3:21
source, the AI read that source, figured out what mattered and updated a set of organized notes that already contained
3:28
everything it learned from the previous source? In other words, what if it started to auto update based on its own
3:34
synthesis? What if those notes already included cross references, flagged contradictions, tracked how your
3:40
understanding evolved? If you're trying to learn how you think and evolve over time, that's what this wiki idea is for.
3:47
It essentially becomes not just a clever file organization system, but actually a
3:53
persistent artifact as a whole where you're capturing the AI's evolving
3:59
understanding of your thinking over time. So the AI might read a paper you
4:04
give it on Monday, write up what it learned, and link back to it what it learned the previous week from some
4:11
other thread that you were working on. The next Friday when you ask a question, the AI doesn't have to reread everything
4:17
from scratch. Instead, it looks at the synthesis that is already sitting there, the cross references that are already built, the contradictions that have been
4:24
flagged. And in Carpathy's own words, the knowledge is compiled once and then kept current. It's not rederived on
4:30
every query. And that is really the key here. Most AI knowledge tools spend compute and tokens to rederive. whereas
4:37
his wiki compiles. That's a fundamentally different relationship between AI and your information and it
4:44
has different strengths and weaknesses than a lot of other predominant memory paradigms including OpenBrain. He
4:50
described his working setup as having the AI agent on one side and Obsidian which is just a note viewing app on the
4:55
other side. And so that allows the AI to make edits based on their conversation and he can browse the results in real
Why AI throws away its cognitive work every time
5:01
time and follow links and check the graph view and read the updated pages and kind of have an evolving conversation with the agent. And of
5:08
course being a programmer the way he talks about it is the LLM is sort of the programmer for the codebase of the wiki
5:14
which means in plain English the note app is where he actually reads and the AI is the one writing in the notes app
5:21
based on a collected series of built documents. Some of them are raw sourced
5:26
that he inputs from previous chats. Some of them are docs. Some of them are synthesis the AI puts together. Think of it like most AI tools are like having a
5:34
brilliant research assistant who reads your entire filing cabinet every time you ask a question and then it gives you
5:39
a really great answer and then immediately forgets everything that it figured out. Andre Carpathy's wiki is
5:44
like that same assistant keeping a running set of notes that are organized and cross-referenced and updated so that
5:52
each question builds on the last one instead of starting over. I think that idea of being able to build on your
5:58
learnings is why 41,000 people jumped on it and bookmarked the post. Right? It's not because the folders and the text
6:04
files themselves are exciting. It's because an AI that builds understanding over time instead of starting from zero
6:09
is something we're all hungry for right now. It's the thing everyone's been waiting for. It's what made people really excited about OpenBrain. But
6:15
there's a catch that almost nobody in these 41,000 bookmarks is thinking about yet. Every time the AI turns a raw
6:23
source into a wiki page, it is making editorial decisions. It's making decisions about how to frame the
6:29
connections between ideas that may be right or wrong, but those are the AI's choices, right? They're not the human's choices. It's making synthesis choices
6:37
somewhat independently of what you may or may not think. And so important nuance could get dropped that m might
6:43
matter a few months from now and you would literally never know. You wouldn't know what's missing because the wiki
6:48
reads so cleanly. This is sort of the same trap as dashboards and analytics. A
6:53
dashboard is so much easier to read than a spreadsheet, but it is a condensation of data, right? It can hide exactly the
7:00
thing you need to see because it just shows only the thing that it thinks you
7:05
want to see in the moment. And to his credit, Andre Carpath has been very honest about this, right? His architecture keeps all the raw sources
7:11
untouched in their own folders. So he can always go back to the originals, which is a really smart design. But to
7:17
be honest, most people building on his pattern are not going to maintain the discipline to go back to raw sources. In
7:23
practice, I think the wiki will become the thing that is trusted as this open source project rolls out. And the source
Knowledge compiled once vs re-derived on every query
7:30
of truth is quietly going to shift from raw material to an AI summary of that
7:36
material, which may be correct 80% of the time. maybe 90% of the time, but where it misses something or where it
7:43
frames something slightly wrong, there are going to be issues that arise and that errors will now be baked into our
7:49
understanding if that is the only way we're approaching memory. And you won't get in the habit of questioning it
7:54
because the whole premise of this when I started this video is that we are lazy people. It's really nice to have a wiki
7:59
where you can just chuck stuff in and it sort of automatically organizes, learns, and comes back with written artifacts.
8:05
And so this is where open brain enters the picture and things get really really interesting. Every knowledge system with
8:11
an AI at its core has to answer one question. When does the AI do the hard
8:17
thinking? Is it when information comes in or is it when you ask about that
8:22
information you got to pick that's the fork everything else follows from that. Carpathy's wiki is a right time system.
8:29
So when a new source arrives like an article, a paper, a set of notes, the AI does not just store it. The AI actually
8:38
actively works against it. It reads the source. It extracts what matters and it writes that understanding into the wiki.
8:44
It will update topic pages for you. It will write relevant summaries for you.
8:50
You get the idea, right? It's going to actively work to add links between
8:55
related ideas, develop concepts, note where new data contradicts something that was filed last week. It will do a
9:02
lot of that thinking at input, right? The hard work then happens one time at
9:08
the beginning, the moment the information comes in the door. After that, you can browse the wiki and get
9:14
pre-built understanding without the AI doing virtually any work at all. It's just retrieving. Open brain is
9:20
different. It is a query time system. When new information arrives, OpenBrain is designed to store it faithfully. It
9:27
tags it. It categorizes it. It makes it searchable. But we're not assuming that
9:33
you need to synthesize that information yet. Nobody's synthesizing. Nobody's doing work. The data is sitting in
9:38
structured tables waiting. When you or your AI agent asks a question, that's
9:44
when the AI goes to work. It reads the relevant entries. at that point at query time. It does the thinking fresh and it
9:51
produces an answer on the fly. So the hard work happens at the moment you need it, not before you need it. So think of
9:58
it this way. Carpathy's wiki is like a study guide that a really good tutor writes for you as you learn the subject.
Write time vs query time: the fundamental fork
10:04
Every time you cover new material, the tutor will update the guide for you so
10:10
you don't get lost along the way. The tutor will add new sections, revise old sections, connect ideas across chapters,
10:16
and really help you dig in so that when exam day comes, you just read the guide, and you're good to go. Which is exactly
10:23
kind of how that wiki is supposed to work. Ideally, the thinking has been done for you. The tutor has prepared everything so perfectly, you can't fail.
10:29
Open brain is like a perfectly organized filing cabinet with a brilliant librarian standing next to that filing
10:36
cabinet for you. Every document is filed. It's indexed. It's searchable. So that when you need an answer, the
10:42
librarian can very quickly pull the relevant file, read through that relevant file for you, and then pinpoint
10:49
exactly what you need to find in that file. It will tell you what you're looking for. The filing is really clean
10:56
and pristine, and that enables the metaphorical librarian to do the thinking fresh in a very efficient way
11:02
every time you ask, so you get exactly the synthesis you're looking for. To be honest with you, I'm not here to compare
11:09
and contrast and give you an easy winner. Study guides and filing cabinets can both be useful, but they're good at different things, and I don't want them
11:15
compared inaccurately. And that's really important. So, why does this matter for you? This is the way to think about it
11:20
that's not about architecture. If you only store stuff, your AI has to figure out what it all means every time you
11:27
ask. You've been feeding it articles, meeting notes, and research for months and months and months and months. You
11:32
ask a question that requires connecting a bunch of different sources together. And the AI has to go and burn tokens. It
11:39
has to find those sources. It has to make sense of them. It has to read them. It has to think through them. It has to
11:46
understand what's going on, figure out how they relate together. And ultimately, it has to produce a
11:53
synthesis that actually works from scratch. And it has to do that every
12:00
single time. Nothing has been pre-built. Now, here's the other side. If you only build a wiki, your AI can read the
12:06
summary, but it cannot do anything precise with the raw data underneath. You want to pull every deal over $50,000
12:14
from the last quarter. You want to filter all your meetings by client name. You want to have three different AI
12:19
tools that query your knowledge base at the same time. A folder of text files cannot answer complex questions like
12:25
that. The understanding is there in synthesized form, but the detailed
12:31
structured data to make meaningful decisions just isn't there. And it isn't there by design. It's just not going to
12:38
be there. In addition, if you have three or more agents, that's just going to break when they're all trying to write
12:44
Markdown files at once. The wiki structure presupposes a single agent
12:50
working for you that just writes in one place. Whereas the open brain structure
12:55
assumes you may want to hook in multiple agents at multiple points to contribute to or pull from a structured database.
Study guide vs filing cabinet with librarian
13:02
Let's move on from structured data to talk about a different kind of challenge with AI. It is difficult right now to
13:09
actually trace how an AI learns or improves over time when there is no
13:14
memory architecture under the system. And I want to talk about a distinction
13:20
between remembering detailed facts which open brain is designed to do and remembering narrative or synthesis which
13:28
the wiki is designed to do. And I want to help you understand how that plays out for a team because it's really
13:34
important to understand that our storage architectures shape the futures that we are unlocking for teams because that
13:40
we're effectively choosing a context layer that you need to make sense of,
13:47
use, input information into, believe, trust, and depend on for decisions. The stakes could not be higher. Most
13:54
organizations are generating enormous volumes of AI touched knowledge right now. We're generating meeting summaries.
14:00
We're generating strategy documents touched by AI. We're generating research outputs. We're generating Slack threads.
14:06
And almost all of it is write once, read never because nobody is maintaining any
14:12
of it. Nobody is synthesizing across any of those documents. Nobody is flagging
14:17
that the Q2 strategy deck contradicts what the CEO said in last week's all
14:22
hands. Your company's AI generated knowledge right now is either a compounding asset or it's just a growing
14:29
pile of noise. And so the choice between the two memory structures here is a lot
14:34
more than a design decision. It's actually the thing that most teams are making by accident that determines how
14:41
reliable their northstar compass in product decisioning is. And the subtlety that matters here is that sometimes
14:47
contradictions are the most valuable thing in your knowledge base. And one of the things that you worry about is that
14:53
you're going to lose the distinctions that you need to make good decisions in a wiki format. So engineering might
14:58
think the timeline for the build is 12 weeks and sales promise the client 8. And something like a smart wiki might
15:03
resolve that contradiction into one coherent narrative rather than flagging that you have a fundamental misalignment. And that is a strategic
15:10
signal in the system that you would not want to synthesize across with an estimate of 10 weeks. The gap between
15:16
what engineering knows and what sales promised is exactly the problem your leadership would need to see in that
15:22
situation. A database that stores both views without resolving them preserves that tension and a well-meaning wiki
15:29
might smooth those all away. So those are some of the structural differences. But if we go past the structural
15:34
differences in these two memory systems, the open brain system and the wiki system, I want to talk a little bit
15:40
about the job that the AI does in each system and why it's important to name
15:45
the AI job description really clearly. One of the sharpest practical differences between these approaches is
15:52
what the AI will spend its time doing. And you need to decide like where do you want to invest in your AI. In Karpathy's
15:58
system, the AI is primarily a writer. The job is to maintain a document. And when you add a new source, you have to
The editorial trap in wiki synthesis
16:04
write to that, right? You have to read the raw material, synthesize it, write what you think about it. Update wiki
16:10
pages, connect new links, make sense of it, add concept explanations, cross
16:16
reference it, create an index. There's a ton to do. It's effectively doing editorial work. It's making judgment
16:23
calls about what's important, about what connects to what, and where those contradictions might lie. Whereas in
16:28
open brain, we think of the AI as primarily a reader. Its job is to answer questions by pulling from the structured
16:34
data and when you or an agent will ask something, the AI will just search the database that has been carefully read
16:41
and carefully organized, read the relevant entries and come back with a
16:46
precise, fresh synthesis based on all of the available data. So effectively, it
16:51
is doing the analytical work on the fly, but it's able to produce more detailed results because all of the detail is
16:57
immediately available in the database. And so those different job descriptions have real consequences. When the AI is a
17:04
writer, you interact with it intensively when new information comes in. Is that a job that you want to do? Do you want to
17:10
interact with it a lot when the new information comes in? it does adding a single research paper trigger updates
17:16
across a dozen wiki pages and is that something you're comfortable doing as you think through and and figure out the connections? It's a somewhat heavy
17:23
operation on the front end, but afterward you end up getting answers that are very cheap because all of your
17:28
thinking is captured in that wiki. The thinking has been done. When the AI is
17:34
more of a reader, as in open brain, what you get is adding new information is lazy and cheap. That's sort of why I did
17:40
it because I'm a lazy person and I want my stuff autocatategorized as cheaply
17:46
and easily as possible. We just write a row, we tag it and we're done. The heavy operation is when you ask a question
17:52
because the AI has to reconstruct understanding from the data each time. So simple lookups can be fast and
17:58
complex lookups will take time as the AI does deep synthesis because it's
18:04
actually interrogating the raw data. That cost is going to recur every time if you ask something similar. But on the
18:10
other hand, you are not going to lose detail if you need to get into the grounds and really understand what is
18:16
going on. The difference between these approaches raises a question that that I think most of us aren't asking yet.
18:21
Whose understanding matters here? When your AI maintains a wiki, what you are
18:27
effectively saying is that when a colleague asks you about a topic, you are willing to check the wiki and trust
18:34
what the AI says before answering. And you are trusting that the AI's capture
18:39
of your understanding or your thinking or the article you gave it is good enough to share with your colleagues as
18:46
yours. Whereas if you have an open brain style database, the providence is very clear. These are facts from identified
18:53
sources with timestamps. You can trace any claim back to where it came from. What you know, you know, and you know
18:59
why you know it. And you can come back with a fair bit of authority and say, "I'm not just trusting the AI's ability
Dashboards hide exactly the thing you need to see
19:05
to synthesize information. I'm actually saying this is the raw material I got. This is the facts that I'm basing this
19:11
on, and this is a considered opinion based on a query across all of the data that I've collected over the last few
19:17
months or the last few weeks or whatever it is for you." That is a deeper and more consequential kind of trust. It
19:22
also means the instructions you give the AI that tells it how to organize your
19:27
wiki becomes the highest leverage document in the whole system. Because if you're building a wiki, I want you to
19:33
think about this for a second. If you're building a wiki, you basically are telling in one markdown file the AI to
19:40
organize and synthesize in a way that's profoundly useful to you and profoundly
19:45
accurate. and you're betting your career that it will get it right or you're going to invest time on every single
19:51
ingest to make sure it's correct and to doublech checkck it. Most people will underinvest in that and the wiki will be
19:56
worse than it should be as a result. Not because it can't be good, but because we're lazy. If we were to talk about
20:02
what each approach is good at and where the advantages are, I would say that Carpathy's wiki wins when you're deep in
20:08
research mode, when you're reading 10 papers on a topic over a couple of weeks, which sounds a lot like what
20:13
Andre does, right? like it's written for him. You could tell, right? And each one might build on. It might contradict the
20:19
last. It's a thinking person's tool. The wiki approach is going to be dramatically better in that situation
20:24
because by paper five, you're continuing to wrestle with it. You're continuing to read. You're giving input. The wiki
20:30
contains a synthesis of the first four. You've read all of the primary sources. You have them in your head as well. And
20:36
paper 5 can get integrated into that existing picture and help you evolve your thinking. contradictions get
20:41
flagged at the moment of ingest and you can see them really quickly. Cross references get built automatically. It's
20:46
basically an academic researcher's dream. And so by paper 10, you have a really rich navigable artifact that
20:52
represents the current state of your understanding of a very difficult subject. It's sort of like notebook LM
20:58
on steroid. It's not just the current state of your files. It also wins
21:03
because your personal knowledge evolves over months and you can actually see it grow. Right? So if you're thinking about
21:08
your health over months about self-improvement about competitive analysis for any domain where the value
21:14
is in the connections between the sources rather than in any single source
21:20
alone then that's where Carpathy's approach is going to win right because you're really looking at how it can help
21:27
you understand a complex synthesis problem but open brain wins when you
21:32
need precise structured operations across your knowledge base. If you want to ask, "Show me every meeting note from
21:38
Q1 where pricing was discussed," that's an open-brain type question. If you want to pull the three most recent competitor
21:44
updates and compare them, that's an open-brain question. Or find all actionable items assigned to me in the
21:50
last two weeks, open brain. Again, these are database queries, right? You are digging in for specific facts. They
21:56
return exact filterable results. A folder of text files can approximate this with some keyword search, but it's
Where Karpathy's wiki wins: deep research mode
22:03
not going to be perfect, right? It's going to miss stuff. it's going to break fast and it's not really what that whole
22:08
wiki system was designed for, especially when you need to combine filters, sort
22:14
by date, or work across hundreds of entries. OpenBrain also wins for multi- aent access when you have clouded code
22:20
and chat GPT and cursor and a scheduled automation all working against the same data source at once, all needing to read
22:27
from and write to the same knowledge store at the same time. Well, you need a database that handles simultaneous access in that situation, not a
22:33
directory of files where two agents editing the same page creates a complete mess. And OpenBrain wins on volume, too,
22:38
right? OpenBrain can handle thousands of entries across dozens of categories with search, with metadata, with relational
22:44
queries. And and Carpathy absolutely acknowledges this. It works best at roughly 100 to 10,000 high signal
22:51
documents. It is not corporate level memory. And I hear corporations saying we should just use this for for our
22:56
company level context layer. And that will not work. And at the upper end, 10,000 documents, you already need extra
23:02
search tooling just to stay manageable. And so when you're dealing with thousands of contacts and transactions and events and tasks and documents on
23:08
top of all of that, structured storage is the only sane option that scales. But
23:13
to be fair, we should look at where both systems break, right? Every system has a load where it starts to break. They just
23:20
tend to break in different ways. So as I've called out, the wiki approach tends to break at scale. So, if you have a
23:25
team that's using it where you are starting to hit that wiki structure from multiple directions, well, now the wiki
23:31
doesn't know how to autooptimize, right? If person A has an understanding that's evolving differently than person B or or
23:36
agent A and agent B all have different approaches and they're trying to update the same wiki page. One, you have a
23:42
conflict and that's going to be a problem. But two, the wiki is going to look like a weird merge of these
23:48
different approaches that doesn't reflect deep personal understanding. Fundamentally, the semantic understanding that you're evolving with
23:54
the wiki is designed for a world that's kind of like Andre's world where he's a researcher and he's thinking deeply
24:00
about a problem and it's for him and it's his evolving understanding with the agent. So for a solo practitioner, you
24:06
don't get issues here. But for a team, this becomes a really serious problem. If your knowledge changes daily, if you
24:12
are an operation where you have project status, you have competitive positioning, you have live deal flow, the cost of reynthesizing the wiki every
24:19
time something comes in becomes really punishing because every change potentially ripples across multiple
24:24
pages in ways that you can't control. And it should not, right? It should just be another data point in the row. And
24:31
so, think of the wiki system as being optimized for like papers and articles speed, not Slack message and ticket
24:38
update speed. And that's the thing that worries me the most is that people don't recognize that a particular knowledge
24:43
system is designed to work at a particular speed of business. And if you don't think about it that way, you might
24:49
implement the wrong one. A neglected database has gaps, but the old facts are still true. as opposed to a wiki. A
24:57
neglected wiki tends to drift because old syntheses become increasingly wrong
Where OpenBrain wins: precise structured operations
25:02
as new information is not integrated, but they still read with the confidence that comes from well-written pros. And
25:08
so database staleness can look like ignorance. It can look like you're missing something. I forgot to put stuff
25:14
into my open brain. But wiki staleness looks differently. It actually looks like active misinformation because you
25:20
don't know that you're wrong because the page reads like it knows what it's talking about because that is the entire purpose. It's supposed to synthesize
25:26
stuff and write confident pros that helps you understand a situation and you might not question the gap that you do
25:32
not see. Now, let's get at some of the scale breakpoints for OpenBrain. And by the way, yes, I am launching fixes for
25:37
these because that's what we're all about with AI. We make things better over time. In the past, Open Brain has
25:43
really cracked around deep synthesis quality. If you try to synthesize 15 different facts at once, the AI can do
25:50
it, but it tends to do it in slightly unpredictable ways because it has no previous map of how that worked in the
25:55
past to do it well. It's essentially searching the shelves of the database every single time from scratch. Now, the
26:02
answer is usually good because the AI is good, but it's rarely as good as a
26:07
pre-built synthesis that had the time to integrate everything deliberately from the beginning. And that is something
26:12
that we're addressing. Browsability is another area that we can think about here. Open brain is deliberately
26:18
headless. There's no artifact you open and wander through. And I built it that way because it gives you the flexibility
26:23
to decide how you want to access it. Now, the nice thing is it's very very easy to build the right head over the
26:31
top. There are people who have added Obsidian to OpenBrain. There's a plugin for that already. So, if that's something where you're like, I just I
26:36
just can't browse the database, you're absolutely right. Just pick the plugin of your choice and you can browse it.
26:42
whether that's Obsidian or something else. Here's another one we're building to improve in the wiki. Contradictions
26:47
surface when new information comes in as long as your initial markdown file deliberately says look for contradiction
26:54
because the AI is actively integrating against existing pages following your prompt. But in a database environment,
27:00
the contradiction might just sit silently in adjacent rows unless you
27:06
specifically ask the right question to expose that contradiction. I'm building a plugin that helps with that. If you
27:11
are interested in essentially running audits that check for contradictions in your data set, we're launching a plug-in
27:17
that helps you use OpenBrain as a contradiction surfacing tool. You can
27:24
actually build out and understand a map of the contradictions in your team or your org data sets really, really easily
27:32
because you can look through the raw material and see it right away. Yes, databases store facts. they're not
27:38
contradiction aware by default, but it's relatively easy in the age of AI to extend something like open brain and
27:44
make it aware of those contradictions. That's what I did. And I know I've spent a lot of time talking about differences, but one of the things I want to call out
27:51
is that there are a lot of common principles that these systems share. They might disagree on implementation
27:56
details, but a lot of the underlying thesis or principles about AI and about data they agree on. They agree that you
Multi-agent access and volume scaling
28:03
own the artifact, not the tool. So, Carpathy's files are text in a folder you control. Open brains data is in a
28:09
database you own. It's the same principle. Neither system hands your knowledge to a platform that can repric
28:14
or lock you in. Carpathy calls this file over app. I've called it building with no SAS middlemen. It's a very similar
28:20
mindset. It's the same conviction at root. In the age of AI, we should own our own context layer. Right? There
28:26
should not be someone who is out there whom we are paying just to own our context layer. Also, in both systems,
28:33
the human's job is curation and questioning. We have to ask what sources go in. We have to figure out what
28:40
questions to ask. We humans retain a big job in both cases. There's no substitute
28:45
for thinking carefully about how to organize your personal context layer.
28:52
And yes, the AI has lots of work to do. It has to understand the facts that you
28:57
put in an open brain. It has to be able to effectively synthesize on the wiki side. It's effectively a similar
29:04
division of labor. It's just timing that work differently because on the carpathy wiki approach, it's doing all of that up
29:09
front and on the open brain approach, it's doing all of that at query time when you ask. In both cases, memory
29:15
compounds through intentional structure, not just through random accumulation. The only difference is how that
29:21
structure is positioned and where that structure lives. So it might live in a wiki in Karpathy's case and it lives in
29:28
a SQL database in OpenBrain's case. But in both cases, the structure is intentionally framed to enable a certain
29:35
kind of connection to occur. And so for wiki work where you might want the
29:40
connections to be between documents, that makes a ton of sense, right? You want all of the documents there. You
29:46
want the AI thinking it through. And that's an intentional structure. Whereas for OpenBrain, the intentional structure
29:51
is a SQL database that you know can scale and it is designed to hold operational facts and make sure that
29:57
they are in a neat place where you can reason against them and get audit ready results from day one. Both systems
30:03
assume that the primary user of the knowledge base isn't you reading in a browser. It's an AI agent working on
30:10
your behalf. And I think increasingly that's going to be the assumption of all of these memory systems. Human
30:15
readability is a bonus. Asian accessibility is actually the requirement. So now we come to what I've
30:22
built because let's be honest, we want a mature system that gives us the strength of both approaches. It's not either of
30:29
those alone. And so the specific architecture that I'm putting together and proposing is the next major open
30:36
brain extension. You want to keep openrain as your permanent store. Don't change that. It's
30:42
a great spot for fax. Everything goes in there. That's fantastic. Every meeting note, every article clip, every research
30:49
finding, every task, every contact, it's all tagged. It's all searchable. It's all queryable. That makes sense. That is
30:55
your durable memory layer right there. And it can handle high volumes. It can handle precise query. It can recall
Where each system breaks at scale
31:01
across multiple domains in your life. It can be the source of truth. And a wiki layer can act as a compiled view on
31:10
demand. And and so I'm launching a new process, a new plug-in where a compilation agent can run on a schedule
31:16
daily, weekly, on demand. And the agent can read from open brain structured
31:21
data. Effectively, it becomes an open brain graph. It can synthesize across
31:27
entries. It can produce wiki pages on demand. It can produce topic summaries. All driven by the idea that if you form
31:33
a graph of your knowledge base, you can get the advantages of the wiki approach
31:38
with the solidity and the factuality that comes from an open-brain SQL database. And so these pages can be
31:46
generated artifacts for you. Think of them like a daily briefing that a really good chief of staff writes by reading
31:51
everything in your files and distilling it into something you can browse. The graph approach allows you to follow
31:58
Karpathy's patterns for synthesis to cross reference to link related topics to flag contradictions to maintain an
32:05
evolving synthesis but it works from structured data not raw files and that
32:12
means it can do things Carpathy's ingest can't like filter entries by date or category before synthesizing. It can
32:18
wait by confidence. It can exclude outdated items. In other words, the synthesis is richer because the
32:24
underlying data is more detailed. The wiki pages are an easy to read layer and
32:29
you can browse them in Obsidian. You can browse them in a note app, but they're all powered by a pre-built context graph
32:37
that lives on your structured data that would not exist without your structured data. They end up being your hot
32:43
reference for when you're actively working on a topic. And the structured data ends up being like the raw files
32:49
that Carpathy uses when he wants to look at the raw material in his wiki. But unlike the raw files, these are easily
32:56
queryable and organized in a SQL database. So you can scale them in a way that you can't with raw files. You do
33:02
not have a 10,000 file limit with OpenBrain in the same way. So the database stays the single source of
33:08
truth. New information always goes into the core SQL open brain first. The wiki
33:13
is never edited directly and this prevents the error compounding problem that several commenters on Carpathy's
33:19
post flagged. If the AI writes something slightly wrong into the wiki and it stays there, the next answer will build
33:25
on that wrong thing and you start to get drift and errors start to accumulate. Whereas in the hybrid model that I'm
33:32
proposing with OpenBrain, the database is always authoritative. The wiki is generated from a graph built off of that
33:39
database. So if the wiki has an error, well, you fix the source data and you
33:45
regenerate. You're not dependent on the wiki as a source of truth. The wiki never drifts from reality because it's
33:51
always rebuilt from ground reality in the SQL database. In open brain terms, this is like a recipe. It's a composable
33:57
workflow that reads from the database and produces an output based on a graph. A wiki compiler recipe can query
Wiki stillness vs database stillness
34:04
relevant tables, synthesize pages through AI, and effectively develop a network of relationships and write that
34:11
output to a wiki directory. And if you're wondering, yes, it can run on an automated schedule. It can get better
34:16
every cycle because the underlying data hopefully, if you're committing to it, grew since last time. It becomes a
34:22
compounding loop as long as you are good at putting data in. And so what you end up with is OpenBrain for structured
34:29
storage and Asian access and a Carpathy style wiki over the top for compiled understanding and human browsability.
34:35
The database ends up feeding the wiki and the wiki never contradicts the
34:40
database. You can query either one depending on what you need, whether it's a precise fact or a synthesized
34:46
narrative, and you can decide which you want to go for depending on the kind of problem that you're solving. And so just
34:53
to be really really blunt about which of these because I know I'm going to get asked which do I build? If you are going
34:58
deep on a single research topic, if you're a solo user, if you don't need precise queries, if you don't need
35:04
multi- aent access, if you want to think by reading and by browsing, you want
35:09
something running in 30 minutes with zero infrastructure. In those situations, then it absolutely makes
35:17
sense to use straight up Carpathy's wiki that he posted on the GitHub because the AI will build the whole system for you
35:23
and it's designed for exactly that kind of solo use case. But you should build with open brain if you need multiple AI
35:29
tools accessing the same memory. If you are assuming that you have a team working with this information, if you're
35:34
capturing high volume information across many categories, if that information is not necessarily narrative based, if it's
35:41
numbersbased, if you need structured queries, if you're building automated agent
35:46
workflows off of this, if you're thinking about this as infrastructure that lasts for a long time and needs to
35:51
scale and not just for a single project. In a sense, a lot of what the wiki feels
35:57
like is a better, cooler version of Notebook LM, which is an amazing tool,
36:02
but not a tool that you can use for an entire team. And so, right now, I tend to say have it both ways. Have your open
36:10
brain running, and if you want a browsable presynthesized understanding layer, just grab the graph plugin and
36:16
add that over the top. And then neither replaces the other, and you get the benefits of both. None of this is to say
36:21
that Andre Carpathy isn't right about what he built. He built a phenomenal tool for himself and for other researchers in a similar position. And
36:28
regardless of which system you end up going with, there are two ideas from Karpathy's post that are worth adopting
The hybrid: OpenBrain graph database plugin
36:34
right away. The idea file as a publishing format is one of those. And
36:39
one of those is really simple. It's the way he shared it. The idea file is his publishing format. Carpathy didn't ship
36:45
a tool. He published a high-level description of an idea that was designed to be pasted into an AI agent that would
36:51
build the specifics with you. This is what I have been saying when I tell you to take my YouTube transcript and feed
36:57
it to an AI. It is a genuinely new way to share technical knowledge. It is a great blueprint for an AI to execute.
37:03
And I think we're going to see more of it because it's much simpler than just having to give an exhaustive step by
37:10
step that a human has to follow. It ends up respecting the reader's agency because they can give their own
37:15
commentary on the idea and then them and the agent can decide the details together while giving them a proven
37:22
pattern to start from. And yes, if you're wondering, you can absolutely take the transcript from this YouTube
37:27
video and get started on your own memory project as we've been going through this video together. Just plug it into your
37:33
agent and go. But the deepest insight here is that Carpathy is moving the AI from Oracle to maintainer. The role AI
37:41
plays is starting to change. Most of us have treated AI as something you ask questions to. Whereas Karpathy correctly
37:48
treats it as something that has an ongoing job, maintaining a knowledge artifact that gets better over time. The
37:54
AI isn't here for magical pie in the sky one-off answers from the clouds. It's
38:00
here for building sustained work that compounds. And the question that we're all facing is just is this the right
38:05
interface for that maintenance role. Right? I don't want to lose the fact that underneath that there is a profound
38:12
insight here about moving from an answer engine mindset to moving to a mindset
38:18
where AI is a maintainer of thinking systems that allow you to think deliberately and do your work better. I
38:25
think that's a profound insight because it allows us to be the ones who curate, who think, who select, who explore, and
38:34
it allows the AI to support us, right? As we ask the right questions, the AI
38:40
can help us by doing so much of the grunt work. And isn't that what we wanted in the first place? Didn't we
38:45
want that division of labor in the AI dream world to be the AI doing more of the grunt work and human judgment being
38:50
relevant? That's the dream. What Andre Karpathy is describing is one way to get
38:56
there, especially if you are in a deep solo research project. And OpenBrain describes another way to do the same
AI as maintainer, not oracle
39:02
thing. It's just focused on more scalable structured data. And yes, you can have the best of both worlds because
39:09
we can build a graph over the top of OpenBrain. This is exactly why I built it Extensible because I knew that we
39:15
would have more stuff coming out around memory in 2026 and I wanted to build a foundation we could build on. So here we
39:21
are. It's our first major test and we can build something over the top that allows us to have the best of this wiki
39:27
approach as well as the best of the structure data that open brain gives us. Ultimately, I think the lesson that we
39:33
get from Karpathy's wiki is that we need to become thinkers about how we want our
39:41
memory and our context layers to work in order to be effective builders of agents
39:47
and effective partners with AI over the second half of 2026 and into 2027. None
39:53
of what I am describing excuses us from doing that thinking. In fact, it's the opposite. What I've been spending time
39:59
telling you in this video is that there is no substitute for making really clear
40:05
distinctions and really clear decisions about the way you want your knowledge
40:10
structured. Whether that's just you in your room with a laptop and it's your personal knowledge base or whether it's
40:16
for your team or whether it's for your org. It is up to you to say I want structured data because I know that I
40:23
need to query against structured data and get reliable results above 10,000 artifacts. Or it's up to you to say you
40:29
know what I want the best of both world. There's going to be some stuff where I'm going to actually want to query with multiple agents and get structured
40:35
results for three different reports at the same time. But over the top of that, I want a graph database that allows me
40:41
to think in connections between materials. That would be a little bit more difficult to do if I was just
40:47
querying structured data by itself. It's up to you. It is not up to me. We all have to wrestle with this. And if you
40:53
are an engineer thinking about this or a product manager thinking about this in an org, you cannot substitute for that
Making the decision for your context layer
41:00
level of thoughtfulness. I'm sorry. You got to do the thinking. And so I hope this video has helped give you the tools
41:06
to make that decision clearly.
