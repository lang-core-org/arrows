class core_edit{
    #node;
    #brakets_set; //all L,R
    #brakets_map; // L -> R
    #brakets_id; //map: L -> x, R -> ~x  ,where x > 0
    #brakets_class; //array: [x] = C, where L -> x
    #braket_unpaired_class;
    #braket_paired_class;
    #braket_current_paired_class;
    #classes; // all determined class
    #highlights_map; //supplier
    #content_class;
    #current_pair = null;
    /**
     * @param node the editeable element
     * @param brakets a list like [[L,C,R],...] which L, R is paired brakets, in single grapheme, uniqued, at least one paired,
     *                becare for, "\u0301" is a single grapheme, while "e\u0301" also is. so if you defined "\u0301" as braket,
     *                you couldn't expect "\u0301" in "e\u0301" while be regonized
     *                C is a class for the text in brakets in default, e.g. "main_quoted"
     * @param braket_unpaired_class a class, e.g. "unpaired"
     * @param braket_paired_class a list of class, e.g. ["paired_0",...]
     * @param braket_current_paired_class a class, e.g. "current"
     * @param content_class (content) => class , reveived a continuous content,return the custom class for content, e.g. "custom_key", or special val in examples
     * @examples class should be uniqued, which defined by CSS  ::highlight(class){...}
     * @examples grapheme, language indepent, defined by Unicode, aka segmenter with locales = "und"
     * @examples content_class returns null if determined to use default highlight
     * @examples content_class returns undefined if no determined
     * @link https://developer.mozilla.org/en-US/docs/Web/API/CSS_Custom_Highlight_API
     * @link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter
     */
    constructor(
        node,
        brakets,
        braket_unpaired_class,
        braket_paired_class,
        braket_current_paired_class,
        content_class
    ){
        if(this.#assert_brakets(brakets)){
            this.#node = node;
            this.#braket_unpaired_class = braket_unpaired_class;
            this.#braket_paired_class = braket_paired_class;
            this.#braket_current_paired_class = braket_current_paired_class;

            this.#classes = [
                this.#braket_unpaired_class,
                ...this.#braket_paired_class,
                this.#braket_current_paired_class,
                ...this.#brakets_class.slice(1)
            ];
            
            this.#highlights_map = () => new Map(
                this.#classes.map( (t) => [t,[]] )
            );
            
            this.#content_class = content_class;
            this.#init();
        }else{
            throw new Error("illegal brakets");
        }
    }

    static #clear_highlights_in(classes){
        for(let clazz of classes){
            CSS.highlights.delete(clazz);
        }
    }

    static #highlights(class_name,range_list){
        let highlight = new Highlight(...range_list);
        CSS.highlights.set(class_name,highlight);
    }

    // 0 before 1: < 0; 0 is 1: == 0; 0 after 1: > 0
    //nan if cannot compare
    static #compare_point(
        container0,
        offset0,
        container1,
        offset1
    ){
        if(container0 === container1){
            return offset0 - offset1;
        }else{
            let C = (container,offset) => {
                if(container.nodeType === Node.TEXT_NODE){
                    return container;
                }else{
                    return container.childNodes[offset];
                }
            };
            let mask = C(container1,offset1).compareDocumentPosition(
                C(container0,offset0)
            );
            if( (mask & Node.DOCUMENT_POSITION_PRECEDING) !== 0){
                return -1;
            }else if( (mask & Node.DOCUMENT_POSITION_FOLLOWING) !== 0){
                return 1;
            }else{
                return Number.NaN;
            }
        }
    }
    static #in_paired(left,right){
        let sel = core_edit.get_sel();
        return (
            core_edit.#compare_point(
                left.endContainer,
                left.endOffset,
                sel.startContainer,
                sel.startOffset
            ) <= 0 &&
            core_edit.#compare_point(
                sel.endContainer,
                sel.endOffset,
                right.startContainer,
                right.startOffset
            ) <= 0
        );
    }

    static #selectNode(node){
        let range = new Range();
        range.selectNode( node );
        return range;
        /*return new StaticRange(
            {
                startContainer: range.startContainer,
                startOffset: range.startOffset,
                endContainer: range.endContainer,
                endOffset: range.endOffset
            }
        );*/
    }
    
    static #und_segmenter = new Intl.Segmenter('und');
    static *#graphemes(str,grapheme_int_set){
        for(let braket of grapheme_int_set){
            if(str.includes(braket)){
                for(let grapheme of core_edit.#und_segmenter.segment(str) ){
                    if(grapheme_int_set.has(grapheme.segment)){
                        yield grapheme;
                    }else{
                        //pass
                    }
                }
                return;
            }else{
                //pass
            }
        }
    }

    static *#graphemes_all(str){
        for(let grapheme of core_edit.#und_segmenter.segment(str) ){
            yield grapheme;
        }
    }

    static #empty_set = new Set();
    static *#walker(node,grapheme_int_set = core_edit.#empty_set){
        node.normalize();

        let abstract_walker = function* (node) {
            let filter = (node) => {
                if(
                    (node.nodeType === Node.TEXT_NODE) ||
                    (node.nodeName == `BR` && node.className == ``)
                ){
                    return NodeFilter.FILTER_ACCEPT;
                }else{
                    return NodeFilter.FILTER_REJECT;
                }
            };
            
            if(filter(node) === NodeFilter.FILTER_ACCEPT){
                yield node;
            }else{
                let walker = document.createTreeWalker(
                    node,
                    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
                    filter
                );
                while(walker.nextNode()){
                    yield walker.currentNode;
                }
            }
        };
        
        let content = (node) => (node.nodeType === Node.TEXT_NODE) ? node.textContent : "\n";
        let select = (node,text,index) => {
            if(node.nodeType === Node.TEXT_NODE){
                return new StaticRange(
                    {
                        startContainer: node,
                        startOffset: index,
                        endContainer: node,
                        endOffset: index + text.length
                    }
                );
            }else{
                return core_edit.#selectNode(node);
            }
        };
        
        if(grapheme_int_set.size !== 0){
            for(let current of abstract_walker(node)){
                for(let grapheme of core_edit.#graphemes(content(current),grapheme_int_set)){
                    yield {
                        content: grapheme.segment,
                        range: select(current,grapheme.segment,grapheme.index)
                    };
                }
            }
        }else{
            for(let current of abstract_walker(node)){
                yield {
                    content: content(current),
                    range: select(current,content,0)
                };
            }
        }
    }

    #core_shader(){
        let vertex = []; //ranges directy belongs current brakets
        
        let highlights = this.#highlights_map();
        let highlight = [];
        let highlight_unpair = highlights.get(
            this.#braket_unpaired_class
        );
        core_edit.#clear_highlights_in(this.#classes);
        this.#current_pair = null; //clear current pair
        
        let expect = []; //brakets expected
        let ranges = []; //associated ranges to brakets
        let gindex = []; //associated the index of brakets in whole text;
        let current_gindex = -1;
        let range_index = null;
        let index = -1;
        let last_index = -1;
        let logic_brakets_dlevel = []; // logical highlights brakets
        let logic_brakets_ranges = []; // logical highlights brakets
        let id = 0;
        for(let {content,range} of core_edit.#walker(this.#node,this.#brakets_set)){
            //record a brakets
            current_gindex = current_gindex + 1;
            logic_brakets_dlevel[ current_gindex ] = 0;
            logic_brakets_ranges[ current_gindex ] = range;

            
            
            id = this.#brakets_id.get(content);
            if(id < 0){
                index = expect.lastIndexOf(id,last_index);
            }else{
                index = -1;
            }
            
            if(index < 0){ //no found
                last_index = last_index + 1;
                expect[last_index] = ~id;
                ranges[last_index] = range;
                gindex[last_index] = current_gindex;
            }else{
                range_index = ranges[index];

                //logical highlights paired brackets
                logic_brakets_dlevel[ gindex[index] ] = -Math.sign(expect[index]); //line:ccdd
                logic_brakets_dlevel[ current_gindex ] = -Math.sign(~id);
                
                
                //highlights text directly belongs brakets
                highlight = highlights.get(
                    this.#brakets_class[~id]
                );
                ranges[last_index + 1] = range;
                for(let i = index; i <= last_index; i = i + 1){
                    if((~expect[i]) < 0 ){ //line:aabb
                        highlight_unpair.push(ranges[i]);
                    }else{
                        //pass
                    }
                    
                    ranges[i] = new StaticRange(
                        {
                            startContainer: ranges[i].endContainer,
                            startOffset: ranges[i].endOffset,
                            endContainer: ranges[i + 1].startContainer,
                            endOffset: ranges[i + 1].startOffset
                        }
                    );
                    
                    highlight.push(ranges[i]);
                }
                
                //highlight current pair brakets
                if(
                    vertex.length === 0 &&
                    core_edit.#in_paired(
                        range_index,
                        range
                    )
                ){
                    highlights.get(
                        this.#braket_current_paired_class
                    ).push(
                        range_index,
                        range
                    );
                    this.#current_pair = [
                        range_index,
                        range
                    ];

                    vertex = ranges.slice(index, last_index + 1); 
                    //ranges[index] ~ ranges[last_index]
                    
                }else{
                    //pass
                }

                //logic pending
                expect[index] = ~0; //magic number,due to line:aabb
                ranges[index] = new StaticRange(
                    {
                        startContainer: range_index.startContainer,
                        startOffset: range_index.startOffset,
                        endContainer: range.endContainer,
                        endOffset: range.endOffset
                    }
                );
                gindex[index] = null; //magic number, due to line:ccdd

                //logic remove
                last_index = index;
                
            }
        }

        

        //really highlights paired brakets
        if(logic_brakets_ranges.length === logic_brakets_dlevel.length){ //maybe always true
            let level = -1;
            for(let i = 0; i < logic_brakets_dlevel.length; i = i + 1){
                switch(logic_brakets_dlevel[i]){
                    case 1:
                        level = level + 1;
                        highlights.get(
                            this.#braket_paired_class[
                                level % this.#braket_paired_class.length
                            ]
                        ).push(
                            logic_brakets_ranges[i]
                        );
                        break;
                    case -1:
                        highlights.get(
                            this.#braket_paired_class[
                                level % this.#braket_paired_class.length
                            ]
                        ).push(
                            logic_brakets_ranges[i]
                        );
                        level = level - 1;
                        break;
                    default:
                        //pass
                }
            }
        }else{
            throw new Error("unexpected error in highlights paired brakets");
        }

        
        //highlight unpaired brakets
        for(let i = 0; i <= last_index; i = i + 1){
            highlight_unpair.push( ranges[i] );
        }
        
        for(let [clazz,lst] of highlights){
            core_edit.#highlights(clazz,lst);
        }
        
        this.visible_sel();
        
        return vertex;
    }

    #assert_brakets(brakets){
        if(
            (brakets instanceof Array) && (brakets.length >= 1) && (brakets.length + 1 > 0) &&
            brakets.every( 
                (paired) => (paired instanceof Array) && (paired.length === 3) &&
                                       paired.every((t) => typeof(t) === "string")
            )
        ){
            this.#brakets_set = new Set(
                brakets.flatMap(
                    ([L,_,R]) => [
                        L.normalize("NFC"),
                        R.normalize("NFC"),
                        L.normalize("NFD"),
                        R.normalize("NFD")
                    ]
                )
            );
            this.#brakets_map = new Map(
                [
                    ...brakets.map( 
                        ([L,_,R]) => [L.normalize("NFC"),R.normalize("NFC")]
                    ),
                    ...brakets.map( 
                        ([L,_,R]) => [L.normalize("NFD"),R.normalize("NFD")]
                    )
                ]
            );
            this.#brakets_id = new Map();
            this.#brakets_class = new Array(brakets.length + 1);
            for(let i = 0; i < brakets.length; i = i + 1){
                let [L,C,R] = brakets[i];
                this.#brakets_id.set(L.normalize("NFC"), i + 1);
                this.#brakets_id.set(R.normalize("NFC"), ~(i + 1));
                this.#brakets_id.set(L.normalize("NFD"), i + 1);
                this.#brakets_id.set(R.normalize("NFD"), ~(i + 1));
                this.#brakets_class[i + 1] = C;
            }

            let flat_brakets_NFC = brakets.flatMap(
                ([L,_,R]) => [
                    L.normalize("NFC"),
                    R.normalize("NFC")
                ]
            );
            let brakets_set_NFC = new Set(flat_brakets_NFC);
            return flat_brakets_NFC.every( 
                 (t) => [...core_edit.#graphemes_all(t)].length === 1
            ) && brakets_set_NFC.size === flat_brakets_NFC.length;
        }else{
            return false;
        }
    }

    #indent(){
        let sel = core_edit.get_sel().cloneRange();
        let con = sel.startContainer?.childNodes?.[sel.startOffset] ?? sel.startContainer;
        while(con !== null && core_edit.src(con) !== "\n"){
            con = con.previousSibling;
        }
        if(con === null){
            sel.setStart(this.#node,0);
        }else{
            sel.setStartAfter(con);
        }
        return core_edit.src(
            sel.cloneContents()
        ).replace(
            /\S[\s\S]*$/gv,
            ""
        );
    }

    #insert(str,highlight_now = true,collapse_to_start = false){
        let sel = core_edit.get_sel();
        let indent = this.#indent();
        sel.deleteContents();
        sel.insertNode(core_edit.doc(str,indent));
        sel.collapse(collapse_to_start);

        if(highlight_now === true){
            this.#render();
        }else{
            //PASS
        }

    }

    #render(){
        let vertex = this.#core_shader();
        
    }

    #keydown(event) {
        if(
            (event.ctrlKey || event.altKey) &&
            /Q|q/.test(event.key)
        ){
            event.preventDefault();
            this.expand_sel();
        }else if(/Enter/.test(event.key)){
            event.preventDefault();
            this.insert_with_paired(`\n`);
        }else if(/Tab/.test(event.key)){
            event.preventDefault();
            this.insert_with_paired(`\t`);
        }else{
            /*PASS*/
        }
    }

    #beforeinput(event) {
        if(/insertText/.test(event.inputType)){
            event.preventDefault();
            this.insert_with_paired(event.data);
        }else{
            //PASS
        }
    }

    #input(event) {
        if(/deleteContentBackward/.test(event.inputType)){//press backspace
            this.#render();
        }else if(/deleteContentForward/.test(event.inputType)){// press del
            this.#render();
        }else if(/deleteByCut/.test(event.inputType)){// after cut
            this.#render();
        }else{
            //PASS
        }
    }

    #compositionstart(event) {
        let sel= core_edit.get_sel();
        sel.deleteContents();
        let node = document.createElement("span");
        node.innerText = "\u200c";
        sel.insertNode(node);
        sel.selectNodeContents(node);

        this.#node.addEventListener(
            "compositionend",
            (event) => {
                let rng = core_edit.get_sel();
                rng.selectNode(node);
                this.insert_with_paired(core_edit.src(node));
            },
            {once: true}
        )

    }

    #paste(event) {
        event.preventDefault();
        this.insert_with_paired(
            event.clipboardData.getData("text/plain")
        );
    }

    #focus(event){
        this.#render();
    }

    #selectionchange(event){
        this.#render();
    }

    #resize(event){
        this.#render();
    }

    #init(){
        this.#node.addEventListener("keydown",(event) => this.#keydown(event));
        this.#node.addEventListener("beforeinput",(event) => this.#beforeinput(event));
        this.#node.addEventListener("input",(event) => this.#input(event));
        this.#node.addEventListener('compositionstart',(event) => this.#compositionstart(event));
        this.#node.addEventListener("paste",(event) => this.#paste(event));
        this.#node.addEventListener("focus",(event) => this.#focus(event));
        document.addEventListener("selectionchange",(event) => this.#selectionchange(event)); // selectionchange is base on document specialy
        window.visualViewport.addEventListener("resize",(event) => this.#resize(event)); // resize is base on window.visualViewport
    }

    static doc(str,indent = ""){
        let Doc=document.createDocumentFragment();
        for(let line of str.match(/\n|[^\n]+/gv) ?? []){
            if(line === "\n"){
                Doc.append(
                    document.createElement("br"),
                    indent
                );
            }else{
                Doc.append(
                    line
                );
            }
        }
        return Doc;
    }

    static src(node){
        return [...core_edit.#walker(node)].map(({content}) => content).join("");
    }

    static get_sel(){
        let sel=window.getSelection().getRangeAt(0);
        return sel;
    }

    /**
     * @param other_rect return a DOMRect located the sel (null means can't locate the sel)
     */
    static rect_sel(sel,other_rect = (sel)=> null){
        if(sel.commonAncestorContainer.nodeName === "#text"){
            return sel.getBoundingClientRect();
        }else{
            let before_sel = sel.startContainer?.childNodes?.[sel.startOffset - 1];
            let after_sel = sel.endContainer?.childNodes?.[sel.endOffset];
            if(
                after_sel?.nodeName === "BR"
            ){
                return after_sel.getBoundingClientRect();
            }else if(
                before_sel?.nodeName === "BR"
            ){
                let brt = before_sel.getBoundingClientRect();
                return new DOMRect(
                    - brt.right, // x
                    brt.bottom,   // y
                    0,         // width
                    brt.height // height
                );
            }else{
                return other_rect(sel);
            }
        }
    }

    visible_sel(){
        // keep the caret visibility
        let sel = core_edit.get_sel();
        if(sel.collapsed === true){
            let fscroll = (min,max) =>{
                return (t) => {
                    if(t < min){
                        return t - min;
                    }else if(t > max){
                        return t - max;
                    }else{
                        return 0;
                    }
                };
            };
            let node_rect = new DOMRect(
                0,                // x (special)
                0,                // y (special)
                this.#node.clientWidth, // width
                this.#node.clientHeight // height
            );
            let sel_rect = core_edit.rect_sel(sel);
            let half_sel_h = sel_rect.height / 2;
            let padding = Number.parseFloat( window.getComputedStyle(this.#node).padding );
            let xscroll = fscroll(
                node_rect.left + padding,
                node_rect.right - padding,
            );
            let yscroll = fscroll(
                node_rect.top + padding + half_sel_h,
                node_rect.bottom - padding - half_sel_h,
            );

            this.#node.scrollBy(
                {
                    left: xscroll(sel_rect.x),
                    top: yscroll(sel_rect.y + half_sel_h),
                    behavior:"smooth"
                }
            );
        }else{
            //PASS
        }   
    }

    expand_sel(sel = core_edit.get_sel()){
        if(this.#current_pair === null){
            //PASS
        }else{
            let [left,right] = this.#current_pair;

            sel.setStart(left.startContainer,left.startOffset);
            sel.setEnd(right.endContainer,right.endOffset);

            this.#render();
        }
    }

    insert_with_paired(str){
        let right = this.#brakets_map.get(str) ?? "";

        if(right === ""){
            this.#insert(str);
        }else{
            let left = str;
            let sel = core_edit.get_sel();
            let content= core_edit.src( sel.cloneContents() );
            this.#insert(left,false);
            this.#insert(content,false);
            this.#insert(right,true,true);
        }
    }
}



