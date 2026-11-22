// Pure: a compact list of common English words, used only to keep English text from being mistaken
// for romanized Bengali (see romanized.ts). Not a dictionary: the course's own English glosses are
// added to it at run time. Lowercase, apostrophes removed ("I'm" -> "im").

const WORDS = `
a about above act add after again against age ago agree air all allow almost alone along already also
although always am among amount an and angry animal another answer any anyone anything anyway appear apple
are area arm around arrive art as ask at away baby back bad bag ball bank bar base be beach bear beat beautiful
because become bed been before begin behind believe bell below best better between big bill bird birth bit
black blood blue board boat body bone book born both bottle bowl box boy bread break breakfast bring brother
brown build burn bus business busy but buy by cake call came can cannot cant car card care carry case cat catch
cause chair chance change child children choose city class clean clear close clothes cloud coat coffee cold color
colour come common company cook cool copy corner cost could country course cover cow cry cup cut dad dance dark
daughter day dead dear death decide deep did die different dinner do doctor does dog dollar done dont door down
draw dream dress drink drive drop dry during each ear early earth east easy eat egg eight either else end enemy
enjoy enough enter even evening ever every everyone everything exactly example except excuse eye face fact fall
family far farm fast fat father fear feel few field fight fill film final find fine finger finish fire first fish
five floor flower fly follow food foot for forget forgive form forward four free fresh friend friends from front
fruit full fun funny future game garden gave get girl give glad glass go god going gold gone good goodbye got
grandfather grandmother great green ground group grow guess guy had hair half hand happen happy hard has hate
have he head hear heart heat heavy hello help her here hers herself hey hi high hill him himself his history hit
hold holiday home hope horse hospital hot hotel hour house how however hundred hungry hurry hurt husband i ice
idea if ill im important in inside instead into iron is island it its itself ive job join joy juice jump just keep
key kid kill kind king kiss kitchen knee knew knife know lady lake land language large last late laugh learn leave
left leg less let letter library lie life light like line lion lips list listen little live long look lose lost
lot love low luck lunch mad made make man many map market marry matter may maybe me mean meat meet men milk mind
mine minute miss mistake mom money month moon more morning most mother mountain mouth move movie mr mrs much music
must my myself name near need never new news next nice night nine no nobody noise none noon nor north nose not
note nothing now number nurse of off office often oh oil ok okay old on once one only open or orange order other
our ours out outside over own page pain paper parent park part party pass past pay peace pen people pepper person
phone pick picture piece pig place plan plane plant plate play please plus pocket point police poor pool pop
possible pot pound power practice pretty price problem pull push put queen question quick quiet quite rain read
ready real really reason red remember rest rice rich ride right ring river road rock room round rule run sad safe
said salt same sand sat save saw say school sea second see seem sell send sentence serious seven several shall
shape share she sheep ship shirt shoe shop short should shoulder show shut sick side sign silver simple since
sing sister sit six size skin skirt sky sleep slow small smell smile snow so soap some somebody someone something
sometimes son song soon sorry sound soup south space speak special spend spoon spring stand star start station
stay steal step stick still stone stop store story street strong student study such sugar summer sun sunday
supper sure sweet swim table take talk tall tea teach teacher team tell ten than thank thanks that thats the
their them then there these they thing think third thirsty this those though thought thousand three through
throw ticket tie till time tired to today together told tomorrow tonight too tooth top touch toward town toy
train travel tree trip trouble true try turn twelve twenty two ugly uncle under understand until up upon us use
usual very visit voice wait wake walk wall want war warm was wash watch water way we weak wear weather week
welcome well went were west wet what whats when where wheres whether which while white who whom whose why wide
wife will win wind window wine winter wish with without woman women wonder wood word work world worry would
write wrong yard year yellow yes yesterday yet you young your yours yourself zero
bye cheers please sir madam miss hello hey thanks thank ok okay sorry pardon excuse
am are is was were been being do does did done doing have has had having will would can could shall should may might must
bangladesh bengali bangla english india kolkata dhaka
cant wont didnt doesnt isnt arent wasnt werent hasnt havent hadnt shouldnt wouldnt couldnt lets hows whos
bro dude cool lol yeah yep nope hmm wow
`;

export const COMMON_ENGLISH: ReadonlySet<string> = new Set(WORDS.split(/\s+/).filter(Boolean));
