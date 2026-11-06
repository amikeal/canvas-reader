// Synthetic Canvas export, built in memory. Mirrors the structure of a real Canvas
// .imscc (verified against an actual export) without shipping anyone's course content.
import { strToU8, zipSync, type Zippable } from 'fflate';

const CCC = 'xmlns="http://canvas.instructure.com/xsd/cccv1p0"';

export const MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="gmanifest" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>Test Course 101</lomimscc:string></lomimscc:title></lomimscc:general>
    <lomimscc:lifeCycle><lomimscc:contribute><lomimscc:date><lomimscc:dateTime>2026-11-01</lomimscc:dateTime></lomimscc:date></lomimscc:contribute></lomimscc:lifeCycle></lomimscc:lom>
  </metadata>
  <organizations><organization identifier="org_1" structure="rooted-hierarchy"><item identifier="LearningModules"></item></organization></organizations>
  <resources>
    <resource identifier="gcourse_syllabus" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="course_settings/syllabus.html" intendeduse="syllabus"><file href="course_settings/syllabus.html"/></resource>
    <resource identifier="gpagehome" type="webcontent" href="wiki_content/home-page.html"><file href="wiki_content/home-page.html"/></resource>
    <resource identifier="gpagehours" type="webcontent" href="wiki_content/office-hours.html"><file href="wiki_content/office-hours.html"/></resource>
    <resource identifier="gpagedraft" type="webcontent" href="wiki_content/draft-page.html"><file href="wiki_content/draft-page.html"/></resource>
    <resource identifier="gasg1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="gasg1/essay-one.html">
      <file href="gasg1/essay-one.html"/><file href="gasg1/assignment_settings.xml"/></resource>
    <resource identifier="gann1" type="imsdt_xmlv1p1"><file href="gann1.xml"/><dependency identifierref="gann1meta"/></resource>
    <resource identifier="gann1meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="gann1meta.xml"><file href="gann1meta.xml"/></resource>
    <resource identifier="gdisc1" type="imsdt_xmlv1p1"><file href="gdisc1.xml"/><dependency identifierref="gdisc1meta"/></resource>
    <resource identifier="gdisc1meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="gdisc1meta.xml"><file href="gdisc1meta.xml"/></resource>
    <resource identifier="glink1" type="imswl_xmlv1p1"><file href="glink1.xml"/></resource>
    <resource identifier="glti1" type="imsbasiclti_xmlv1p3"><file href="lti_resource_links/glti1.xml"/></resource>
    <resource identifier="gfile1" type="webcontent" href="web_resources/Week 1/Lecture (1).pdf"><file href="web_resources/Week 1/Lecture (1).pdf"/></resource>
    <resource identifier="gfile2" type="webcontent" href="web_resources/Uploaded Media/banner.png"><file href="web_resources/Uploaded Media/banner.png"/></resource>
    <resource identifier="gbank1" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="non_cc_assessments/gbank1.xml.qti"><file href="non_cc_assessments/gbank1.xml.qti"/></resource>
    <resource identifier="gquiz1" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="gquiz1/assessment_qti.xml"/><dependency identifierref="gquiz1meta"/></resource>
    <resource identifier="gquiz1meta" type="associatedcontent/imscc_xmlv1p1/learning-application-resource" href="gquiz1/assessment_meta.xml"><file href="gquiz1/assessment_meta.xml"/><file href="non_cc_assessments/gquiz1.xml.qti"/></resource>
    <resource identifier="gweird" type="imsqti_xmlv2p0/mystery"><file href="weird.xml"/></resource>
  </resources>
</manifest>`;

const COURSE_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<course identifier="gcourse" ${CCC}>
  <title>Test Course 101: Fundamentals</title>
  <course_code>TEST 101</course_code>
  <start_at>2026-08-24T05:00:00</start_at>
  <conclude_at>2026-12-20T06:00:00</conclude_at>
  <default_view>wiki</default_view>
  <tab_configuration>[{"id":0},{"id":14},{"id":1},{"id":10},{"id":4},{"id":5},{"id":"context_external_tool_x"},{"id":3,"hidden":true},{"id":8,"hidden":true},{"id":11,"hidden":true},{"id":2,"hidden":true}]</tab_configuration>
</course>`;

const MODULE_META = `<?xml version="1.0" encoding="UTF-8"?>
<modules ${CCC}>
  <module identifier="gmod2"><title>Week 2</title><workflow_state>unpublished</workflow_state><position>2</position>
    <items><item identifier="gi20"><content_type>WikiPage</content_type><workflow_state>unpublished</workflow_state><title>Draft</title><identifierref>gpagedraft</identifierref><position>1</position><indent>0</indent></item></items>
  </module>
  <module identifier="gmod1"><title>Week 1: Basics</title><workflow_state>active</workflow_state><position>1</position><require_sequential_progress>false</require_sequential_progress>
    <items>
      <item identifier="gi5"><content_type>Assignment</content_type><workflow_state>active</workflow_state><title>Essay One</title><identifierref>gasg1</identifierref><position>5</position><indent>1</indent></item>
      <item identifier="gi1"><content_type>WikiPage</content_type><workflow_state>active</workflow_state><title>Office Hours</title><identifierref>gpagehours</identifierref><position>1</position><indent>0</indent></item>
      <item identifier="gi2"><content_type>ExternalUrl</content_type><workflow_state>active</workflow_state><title>Schneier</title><identifierref>gi2</identifierref><url>https://example.org/security-mindset</url><position>2</position><new_tab>true</new_tab><indent>1</indent></item>
      <item identifier="gi3"><content_type>Attachment</content_type><workflow_state>active</workflow_state><title>Lecture (1).pdf</title><identifierref>gfile1</identifierref><position>3</position><indent>1</indent></item>
      <item identifier="gi4"><content_type>ContextModuleSubHeader</content_type><workflow_state>active</workflow_state><title>Assignments</title><position>4</position><indent>0</indent></item>
      <item identifier="gi6"><content_type>DiscussionTopic</content_type><workflow_state>active</workflow_state><title>Intro thread</title><identifierref>gdisc1</identifierref><position>6</position><indent>1</indent></item>
      <item identifier="gi7"><content_type>Quizzes::Quiz</content_type><workflow_state>active</workflow_state><title>Quiz 1</title><identifierref>gquiz1</identifierref><position>7</position><indent>1</indent></item>
      <item identifier="gi8"><content_type>ContextExternalTool</content_type><workflow_state>active</workflow_state><title>Publisher Lab</title><identifierref>glti1</identifierref><url>https://tool.example.com/launch</url><position>8</position><indent>1</indent></item>
    </items>
  </module>
</modules>`;

const page = (title: string, id: string, body: string, extra = '') => `<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/><title>${title}</title>
<meta name="identifier" content="${id}"/>${extra}</head>
<body>${body}</body></html>`;

const HOME_BODY = `<p><img src="$IMS-CC-FILEBASE$/Uploaded%20Media/banner.png?canvas_download=1" alt="banner" data-api-endpoint="https://canvas.example.edu/api/v1/courses/1/files/2"></p>
<h2>Welcome!</h2>
<p>See <a href="$WIKI_REFERENCE$/pages/gpagehours">office hours</a>, the <a href="$CANVAS_OBJECT_REFERENCE$/assignments/gasg1">essay</a>,
the <a href="$IMS-CC-FILEBASE$/Week%201/Lecture%20(1).pdf">lecture</a>, <a href="$CANVAS_COURSE_REFERENCE$/modules">modules</a>,
<a href="$CANVAS_COURSE_REFERENCE$/external_tools/2042">a tool</a>, <a href="/courses/12345/pages/office-hours">old link</a>
and <a href="$IMS-CC-FILEBASE$/missing.docx">a missing file</a>.</p>
<p><a href="https://example.org" target="_top" onclick="steal()">external</a></p>
<script>alert('xss')</script>
<img src="x" onerror="alert(1)">
<iframe src="https://www.youtube.com/embed/abc"></iframe>
<iframe src="http://insecure.example.com/embed"></iframe>
<iframe src="javascript:alert(1)"></iframe>
<form action="https://evil.example.com"><input name="pw"></form>`;

const ASSIGNMENT_SETTINGS = `<?xml version="1.0" encoding="UTF-8"?>
<assignment identifier="gasg1" ${CCC}>
  <title>Essay One</title>
  <time_zone_edited>Central Time (US &amp; Canada)</time_zone_edited>
  <due_at>2026-09-03T17:00:00</due_at>
  <all_day>false</all_day>
  <assignment_group_identifierref>ggroup1</assignment_group_identifierref>
  <workflow_state>published</workflow_state>
  <allowed_extensions>pdf,docx</allowed_extensions>
  <points_possible>20.0</points_possible>
  <grading_type>points</grading_type>
  <submission_types>online_upload,online_text_entry</submission_types>
  <position>1</position>
  <peer_reviews>false</peer_reviews>
</assignment>`;

const topic = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"><title>${title}</title><text texttype="text/html">${body
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')}</text></topic>`;

const topicMeta = (id: string, title: string, type: string, extra = '') => `<?xml version="1.0" encoding="UTF-8"?>
<topicMeta identifier="${id}meta" ${CCC}><topic_id>${id}</topic_id><title>${title}</title><type>${type}</type>
<workflow_state>active</workflow_state><posted_at>2026-09-01T14:00:00</posted_at>${extra}</topicMeta>`;

const QTI_ITEMS = `
<item ident="q-mc" title="Question">
  <itemmetadata><qtimetadata>
    <qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_choice_question</fieldentry></qtimetadatafield>
    <qtimetadatafield><fieldlabel>points_possible</fieldlabel><fieldentry>2.0</fieldentry></qtimetadatafield>
  </qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/html">&lt;p&gt;Which is a triad element?&lt;/p&gt;</mattext></material>
    <response_lid ident="response1" rcardinality="Single"><render_choice>
      <response_label ident="11"><material><mattext texttype="text/plain">Confidentiality</mattext></material></response_label>
      <response_label ident="12"><material><mattext texttype="text/plain">Velocity &lt;b&gt;</mattext></material></response_label>
    </render_choice></response_lid></presentation>
  <resprocessing><respcondition continue="No"><conditionvar><varequal respident="response1">11</varequal></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
  <itemfeedback ident="general_fb"><flow_mat><material><mattext texttype="text/html">SECRET-FEEDBACK</mattext></material></flow_mat></itemfeedback>
</item>
<item ident="q-ma" title="Question">
  <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>multiple_answers_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/html">Pick two</mattext></material>
    <response_lid ident="response1" rcardinality="Multiple"><render_choice>
      <response_label ident="21"><material><mattext texttype="text/plain">A</mattext></material></response_label>
      <response_label ident="22"><material><mattext texttype="text/plain">B</mattext></material></response_label>
      <response_label ident="23"><material><mattext texttype="text/plain">C</mattext></material></response_label>
    </render_choice></response_lid></presentation>
  <resprocessing><respcondition continue="No"><conditionvar><and><varequal respident="response1">21</varequal><varequal respident="response1">23</varequal><not><varequal respident="response1">22</varequal></not></and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
</item>
<item ident="q-fib" title="Question">
  <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>fill_in_multiple_blanks_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/html">Roses are [c1]</mattext></material>
    <response_lid ident="response_c1"><material><mattext>c1</mattext></material><render_choice>
      <response_label ident="31"><material><mattext texttype="text/plain">BLANKANSWER</mattext></material></response_label>
    </render_choice></response_lid></presentation>
  <resprocessing><respcondition><conditionvar><varequal respident="response_c1">31</varequal></conditionvar><setvar varname="SCORE" action="Add">100</setvar></respcondition></resprocessing>
</item>
<item ident="q-num" title="Question">
  <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>numerical_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/html">2x2=</mattext></material>
    <response_str ident="response1" rcardinality="Single"><render_fib fibtype="Decimal"><response_label ident="answer1"/></render_fib></response_str></presentation>
  <resprocessing><respcondition continue="No"><conditionvar><or><varequal respident="response1">4.0</varequal><and><vargte respident="response1">4.0</vargte><varlte respident="response1">4.0</varlte></and></or></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition>
  <respcondition continue="No"><conditionvar><and><vargte respident="response1">3.9</vargte><varlte respident="response1">4.1</varlte></and></conditionvar><setvar action="Set" varname="SCORE">100</setvar></respcondition></resprocessing>
</item>
<item ident="q-essay" title="Question">
  <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>essay_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
  <presentation><material><mattext texttype="text/html">Discuss.</mattext></material>
    <response_str ident="response1" rcardinality="Single"><render_fib><response_label ident="answer1" rshuffle="No"/></render_fib></response_str></presentation>
  <resprocessing><respcondition continue="No"><conditionvar><other/></conditionvar></respcondition></resprocessing>
</item>`;

const BANK_QTI = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <objectbank ident="gbank1"><qtimetadata><qtimetadatafield><fieldlabel>bank_title</fieldlabel><fieldentry>Unit 1 Bank</fieldentry></qtimetadatafield></qtimetadata>
  ${QTI_ITEMS}
  </objectbank>
</questestinterop>`;

const QUIZ_QTI = `<?xml version="1.0" encoding="UTF-8"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="gquiz1" title="Quiz 1">
    <section ident="root_section">
      ${QTI_ITEMS.split('</item>')[0]}</item>
      <section ident="ggrp" title="Random pick">
        <selection_ordering><selection><sourcebank_ref>gbank1</sourcebank_ref><selection_number>2</selection_number>
          <selection_extension><points_per_item>1.5</points_per_item></selection_extension></selection></selection_ordering>
      </section>
    </section>
  </assessment>
</questestinterop>`;

const QUIZ_META = `<?xml version="1.0" encoding="UTF-8"?>
<quiz identifier="gquiz1" ${CCC}>
  <title>Quiz 1</title><description>&lt;p&gt;Read chapter 1 first.&lt;/p&gt;</description>
  <quiz_type>assignment</quiz_type><points_possible>5.0</points_possible><time_limit>30</time_limit><allowed_attempts>1</allowed_attempts>
  <due_at>2026-09-10T04:59:00</due_at><available>true</available>
  <assignment identifier="gquizasg"><title>Quiz 1</title></assignment>
</quiz>`;

// New Quizzes export shape (verified against a real export): malformed xmlns:xsi
// that browsers reject, <available>false</available> despite a published assignment,
// questions only in non_cc_assessments, fill-in-blank labels that ARE the answers.
const NEWQ_META = `<?xml version="1.0"?>
<quiz xmlns="http://canvas.instructure.com/xsd/cccv1p0" xmlns:xsi="http://canvas.instructure.com/xsd/cccv1p0 https://canvas.instructure.com/xsd/cccv1p0.xsd" identifier="gnewq1">
  <title>New Quiz 1</title><description/>
  <due_at>2024-01-30T22:20:00Z</due_at>
  <quiz_type>assignment</quiz_type><points_possible>10.0</points_possible>
  <available>false</available>
  <assignment identifier="gnewqasg">
    <title>New Quiz 1</title><due_at>2024-01-30T22:20:00Z</due_at>
    <workflow_state>published</workflow_state>
    <quiz_identifierref>gnewq1</quiz_identifierref>
    <points_possible>10.0</points_possible>
    <assignment_group_identifierref>gquizgroup</assignment_group_identifierref>
    <submission_types>online_quiz</submission_types><position>1</position>
  </assignment>
</quiz>`;

const NEWQ_QTI = `<?xml version="1.0"?>
<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2">
  <assessment ident="gnewq1" title="New Quiz 1" external_assignment_id="2032078">
    <section ident="root_section">
      <item ident="nq-fib" title="">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>fill_in_multiple_blanks_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation><material><mattext texttype="text/html">&lt;p&gt;GPT stands for [dc1a0e7e-fe3b-4be5-85d9-11d267307216] Pre-trained Transformer&lt;/p&gt;</mattext></material>
          <response_lid ident="response_dc1a0e7e-fe3b-4be5-85d9-11d267307216"><material><mattext>SECRETBLANK</mattext></material>
            <render_choice><response_label ident="dc1a0e7e-fe3b-4be5-85d9-11d267307216-0" answer_type="openEntry"><material><mattext texttype="text/plain">SECRETBLANK</mattext></material></response_label></render_choice>
          </response_lid></presentation>
        <resprocessing><respcondition><conditionvar><varequal respident="response_dc1a0e7e-fe3b-4be5-85d9-11d267307216">dc1a0e7e-fe3b-4be5-85d9-11d267307216-0</varequal></conditionvar><setvar varname="SCORE" action="Add">100</setvar></respcondition></resprocessing>
      </item>
      <item ident="nq-cat" title="">
        <itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>question_type</fieldlabel><fieldentry>categorization_question</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
        <presentation><material><mattext texttype="text/html">Sort these</mattext></material>
          <response_lid ident="cat-ml" rcardinality="Multiple"><material><mattext texttype="text/plain">ML</mattext></material><render_choice>
            <response_label ident="i1"><material><mattext texttype="text/plain">Learns from data</mattext></material></response_label>
            <response_label ident="i2"><material><mattext texttype="text/plain">Senses and acts</mattext></material></response_label></render_choice></response_lid>
          <response_lid ident="cat-ai" rcardinality="Multiple"><material><mattext texttype="text/plain">AI</mattext></material><render_choice>
            <response_label ident="i1"><material><mattext texttype="text/plain">Learns from data</mattext></material></response_label>
            <response_label ident="i2"><material><mattext texttype="text/plain">Senses and acts</mattext></material></response_label></render_choice></response_lid>
        </presentation>
        <resprocessing>
          <respcondition><conditionvar><varequal respident="cat-ml">i1</varequal></conditionvar><setvar action="Add" varname="SCORE">50</setvar></respcondition>
          <respcondition><conditionvar><varequal respident="cat-ai">i2</varequal></conditionvar><setvar action="Add" varname="SCORE">50</setvar></respcondition>
        </resprocessing>
      </item>
    </section>
  </assessment>
</questestinterop>`;

export function fixtureFiles(): Record<string, string | Uint8Array> {
  return {
    'imsmanifest.xml': MANIFEST,
    'course_settings/course_settings.xml': COURSE_SETTINGS,
    'course_settings/module_meta.xml': MODULE_META,
    'course_settings/assignment_groups.xml': `<?xml version="1.0"?><assignmentGroups ${CCC}><assignmentGroup identifier="ggroup1"><title>Papers</title><position>1</position><group_weight>40.0</group_weight></assignmentGroup><assignmentGroup identifier="gquizgroup"><title>Quizzes</title><position>2</position></assignmentGroup></assignmentGroups>`,
    'course_settings/grading_standards.xml': `<?xml version="1.0"?><gradingStandards ${CCC}><gradingStandard identifier="gs1"><title>Letters</title><data>[["A",0.9],["B",0.8],["F",0]]</data><points_based>false</points_based></gradingStandard></gradingStandards>`,
    'course_settings/files_meta.xml': `<?xml version="1.0"?><fileMeta ${CCC}><folders><folder path="Uploaded Media"><hidden>true</hidden></folder></folders></fileMeta>`,
    'course_settings/rubrics.xml': `<?xml version="1.0"?><rubrics ${CCC}/>`,
    'course_settings/syllabus.html': `<html><head><title>Syllabus</title></head><body><h1>Syllabus</h1><p>Read <a href="$WIKI_REFERENCE$/pages/office-hours">office hours</a>.</p></body></html>`,
    'wiki_content/home-page.html': page('Home Page', 'gpagehome', HOME_BODY, '<meta name="workflow_state" content="active"/><meta name="front_page" content="true"/>'),
    'wiki_content/office-hours.html': page('Office Hours', 'gpagehours', '<p>Tuesdays 2–4pm.</p>', '<meta name="workflow_state" content="active"/>'),
    'wiki_content/draft-page.html': page('Draft', 'gpagedraft', '<p>DRAFT-CONTENT</p>', '<meta name="workflow_state" content="unpublished"/>'),
    'gasg1/essay-one.html': page('Assignment: Essay One', 'gasg1', '<p>Write 500 words on <a href="$CANVAS_OBJECT_REFERENCE$/quizzes/gquiz1">the quiz topic</a>.</p>'),
    'gasg1/assignment_settings.xml': ASSIGNMENT_SETTINGS,
    'gann1.xml': topic('Class cancelled', '<p>No class today. See <a href="$CANVAS_OBJECT_REFERENCE$/discussion_topics/gdisc1">the thread</a>.</p>'),
    'gann1meta.xml': topicMeta('gann1', 'Class cancelled', 'announcement'),
    'gdisc1.xml': topic('Intro thread', '<p>Introduce yourself.</p>'),
    'gdisc1meta.xml': topicMeta(
      'gdisc1',
      'Intro thread',
      'topic',
      '<assignment identifier="gdiscasg"><title>Intro thread</title><points_possible>5</points_possible><due_at>2026-09-05T04:59:00</due_at><assignment_group_identifierref>ggroup1</assignment_group_identifierref><workflow_state>published</workflow_state></assignment>',
    ),
    'glink1.xml': `<?xml version="1.0"?><webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>Schneier</title><url href="https://example.org/security-mindset"/></webLink>`,
    'lti_resource_links/glti1.xml': `<?xml version="1.0"?><cartridge_basiclti_link xmlns="http://www.imsglobal.org/xsd/imslticc_v1p3" xmlns:blti="http://www.imsglobal.org/xsd/imsbasiclti_v1p0" xmlns:lticm="http://www.imsglobal.org/xsd/imslticm_v1p0"><blti:title>Publisher Lab</blti:title><blti:description>Homework system</blti:description><blti:secure_launch_url>https://tool.example.com/lti</blti:secure_launch_url><blti:extensions platform="canvas.instructure.com"><lticm:property name="resource_link_url">https://tool.example.com/link/1</lticm:property></blti:extensions></cartridge_basiclti_link>`,
    'web_resources/Week 1/Lecture (1).pdf': strToU8('%PDF-1.4\n% fake pdf\n'),
    'web_resources/Uploaded Media/banner.png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    'non_cc_assessments/gbank1.xml.qti': BANK_QTI,
    'non_cc_assessments/gquiz1.xml.qti': QUIZ_QTI,
    'gquiz1/assessment_meta.xml': QUIZ_META,
    'gquiz1/assessment_qti.xml': QUIZ_QTI,
    'gnewq1/assessment_meta.xml': NEWQ_META,
    'gnewq1/assessment_qti.xml': `<?xml version="1.0"?><questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="gnewq1" title="New Quiz 1"><section ident="root_section"/></assessment></questestinterop>`,
    'non_cc_assessments/gnewq1.xml.qti': NEWQ_QTI,
    'weird.xml': '<x/>',
  };
}

export function buildFixture(extra: Zippable = {}): Uint8Array {
  const z: Zippable = {};
  for (const [k, v] of Object.entries(fixtureFiles())) z[k] = typeof v === 'string' ? strToU8(v) : v;
  return zipSync({ ...z, ...extra });
}
