class edit extends core_edit{

    /**
     * @param {*} editor the contentediable element
     * @param {*} keywords [key...] where key should be ^\p{L}+$/v,
     *            key in code should surrounded by space character
     */
    constructor(editor,keywords = 
                ["if","for","while","else","let","do","def","lambda"]
               ){
        super(
            editor,
            [
                ["(","text_core",")"],
                ["[","text_const","]"],
                ["{","text_other","}"]
            ],
            "quote_unpair",
            ["quote_0","quote_1","quote_2"],
            "quote_current_pair",
            [
                [
                    "arrow",
                    new RegExp(edit.arrow()),
                    new RegExp(edit.varrow())
                ],
                [
                    "keyword",
                    ...edit.proc_keywords(keywords)
                ];
        );
        
        editor.addEventListener(
            "keydown",
            (event) => this.keydown(event)
        );

        editor.focus();
    }
    
    static arrow(){
        return `→`;
    }
    
    static varrow(){
        return `←`;
    }

    static proc_keyword(keyword){
        if(
            (keyword instanceof Array) &&
            keyword.every( (key) => 
                (typeof(key) === "string") &&
                (/^\p{L}+$/v.test(key))
            )
        ){
            return keyword.flatMap( 
                (key) => new RegExp(`\s${key}\s`)
            );
        }else{
            throw new Error("illegal keyword");
        }
    }

    keydown(event){
        if(event.ctrlKey || event.altKey){
            if(/(Arrow)?Right/.test(event.key)){
                event.preventDefault();
                this.insert_with_paired(edit.arrow());
            }else if(/(Arrow)?Left/.test(event.key)){
                event.preventDefault();
                this.insert_with_paired(edit.varrow());
            }else{
                //pass
            }
        }else{
            //pass
        }
    }

}

function init(code,toolbar){
    let editor = new edit(code);
    //=========
    let append_tool = (src, fclick)=>{
        let button = document.createElement("button");
        button.append(core_edit.doc(src));
        button.addEventListener(
            "click",
            (event) => {
                code.focus();
                fclick();
            }
        );
        toolbar.append(button);
    };
    append_tool(
        "{}",
        () => editor.insert_with_paired("{")
    );
    append_tool(
        "[]",
        () => editor.insert_with_paired("[")
    );
    append_tool(
        "()",
        () => editor.insert_with_paired("(")
    );
    append_tool(
        edit.arrow(),
        () => editor.insert_with_paired(edit.arrow())
    );
    append_tool(
        edit.varrow(),
        () => editor.insert_with_paired(edit.varrow())
    );
    append_tool(
        "Tab",
        () => editor.insert_with_paired(`\t`)
    );
    append_tool(
        "<{[(..)]}>",
        ()=> editor.expand_sel()
    );
    editor.insert_with_paired(
`\
( : Input ()
[ : Input []
{ : Input {}
Alt/Ctrl + → : Input →
Alt/Ctrl + ← : Input ←
Alt/Ctrl + Q/q : Expand selection to the next outer (), [], or {}
`
);

}
